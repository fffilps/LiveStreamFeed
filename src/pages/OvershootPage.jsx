/**
 * Overshoot.ai stream demo — uses dev-only `/api/overshoot/*` proxies (vite.config.js).
 * Production: replicate those proxies on your backend; never ship OVERSHOOT_API_KEY to the client.
 *
 * Mux bridge: public HLS (`stream.mux.com/...m3u8`) plays in a `<video>`, then `captureStream()` republishes
 * into Overshoot’s LiveKit room so `ovs://` chat references work. Requires Mux **public** playback and CDN CORS
 * allowing decoded frames for capture (spike in browsers if capture fails).
 *
 * @see https://docs.overshoot.ai/quickstart
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'
import { Room, RoomEvent, Track } from 'livekit-client'
import { resolveMuxPlaybackSource } from '../lib/watchUrl'

const KEEPALIVE_INTERVAL_MS = 15_000
const DEFAULT_MODEL = 'google/gemma-4-E4B-it'

/**
 * Load Mux (or any) HLS URL into a video element. Uses hls.js where supported; Safari uses native HLS.
 * CORS: `video.crossOrigin = 'anonymous'` must be set before loading so captureStream is usable when allowed.
 */
function loadMuxHlsIntoVideo(video, hlsUrl, hlsInstanceRef) {
  return new Promise((resolve, reject) => {
    const fail = (err) => reject(err instanceof Error ? err : new Error(String(err)))
    const timeout = window.setTimeout(() => fail(new Error('HLS load timeout (30s)')), 30_000)

    const done = () => {
      window.clearTimeout(timeout)
      resolve()
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true })
      hlsInstanceRef.current = hls
      hls.loadSource(hlsUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().then(done).catch(fail)
      })
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          window.clearTimeout(timeout)
          fail(new Error(`HLS fatal: ${data.type} ${data.details ?? ''}`))
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl
      video.addEventListener(
        'loadedmetadata',
        () => {
          video.play().then(done).catch(fail)
        },
        { once: true },
      )
      video.addEventListener('error', () => fail(new Error('Native HLS playback error')), { once: true })
    } else {
      window.clearTimeout(timeout)
      fail(new Error('HLS not supported in this browser'))
    }
  })
}

export default function OvershootPage() {
  const videoRef = useRef(null)
  const roomRef = useRef(null)
  const keepaliveTimerRef = useRef(null)
  const streamRef = useRef(null)
  const hlsRef = useRef(null)

  const [sourceMode, setSourceMode] = useState(/** @type {'camera' | 'mux'} */ ('camera'))
  const [muxInput, setMuxInput] = useState('')
  const [stream, setStream] = useState(null)
  const [publishInfo, setPublishInfo] = useState(null)
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(false)
  const [chatOut, setChatOut] = useState('')
  const [chatBusy, setChatBusy] = useState(false)

  const muxResolved = useMemo(() => resolveMuxPlaybackSource(muxInput), [muxInput])

  const stopKeepalive = useCallback(() => {
    if (keepaliveTimerRef.current != null) {
      window.clearInterval(keepaliveTimerRef.current)
      keepaliveTimerRef.current = null
    }
  }, [])

  const destroyMuxPlayback = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    const el = videoRef.current
    if (el) {
      el.pause()
      el.removeAttribute('src')
      el.load()
      el.srcObject = null
      el.removeAttribute('crossOrigin')
    }
  }, [])

  const disconnectRoom = useCallback(async () => {
    stopKeepalive()
    const room = roomRef.current
    roomRef.current = null
    if (room) {
      await room.disconnect()
    }
    destroyMuxPlayback()
    setConnected(false)
  }, [stopKeepalive, destroyMuxPlayback])

  const runKeepalive = useCallback(async () => {
    const sid = streamRef.current?.id
    if (!sid) return
    try {
      const res = await fetch(`/api/overshoot/streams/${encodeURIComponent(sid)}/keepalive`, {
        method: 'POST',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          typeof body?.detail === 'string'
            ? body.detail
            : body?.error || res.statusText
        throw new Error(msg)
      }
      if (body?.publish) {
        setPublishInfo(body.publish)
        if (streamRef.current) {
          streamRef.current = {
            ...streamRef.current,
            publish: body.publish,
            expires_at_ms: body.expires_at_ms,
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    return () => {
      void disconnectRoom()
    }
  }, [disconnectRoom])

  function changeSourceMode(mode) {
    if (mode !== sourceMode && connected) {
      void disconnectRoom()
    }
    setSourceMode(mode)
    setError(null)
  }

  async function createStream() {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const res = await fetch('/api/overshoot/streams', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          typeof body?.detail === 'string'
            ? body.detail
            : body?.error || res.statusText
        throw new Error(msg)
      }
      streamRef.current = body
      setStream(body)
      setPublishInfo(body.publish ?? null)
      setNotice(
        body?.id
          ? `Stream ready · id ${body.id.slice(0, 8)}… · connect ${sourceMode === 'mux' ? 'Mux HLS' : 'camera'} below.`
          : null,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function connectCamera() {
    const pub = publishInfo
    if (!pub?.url || !pub?.token) {
      setError('Create a stream first and wait for publish URL + token.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await disconnectRoom()
      const room = new Room()
      roomRef.current = room

      room.on(RoomEvent.LocalTrackPublished, (publication) => {
        if (publication.track?.kind === 'video' && videoRef.current) {
          publication.track.attach(videoRef.current)
        }
      })

      await room.connect(pub.url, pub.token)
      await room.localParticipant.enableCameraAndMicrophone()
      setConnected(true)

      const pubs = room.localParticipant.videoTrackPublications
      for (const p of pubs.values()) {
        if (p.track && videoRef.current) {
          p.track.attach(videoRef.current)
          break
        }
      }

      stopKeepalive()
      keepaliveTimerRef.current = window.setInterval(() => {
        void runKeepalive()
      }, KEEPALIVE_INTERVAL_MS)
      void runKeepalive()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      await disconnectRoom()
    } finally {
      setBusy(false)
    }
  }

  async function connectMuxHls() {
    const pub = publishInfo
    const { hlsUrl } = muxResolved
    if (!pub?.url || !pub?.token) {
      setError('Create a stream first and wait for publish URL + token.')
      return
    }
    if (!hlsUrl) {
      setError('Paste a Mux playback ID or a player.mux.com / stream.mux.com URL.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await disconnectRoom()
      const room = new Room()
      roomRef.current = room

      await room.connect(pub.url, pub.token)

      const video = videoRef.current
      if (!video) throw new Error('Missing video element')

      video.crossOrigin = 'anonymous'
      video.muted = true
      video.playsInline = true

      await loadMuxHlsIntoVideo(video, hlsUrl, hlsRef)

      const captured = video.captureStream(30)
      const vTrack = captured.getVideoTracks()[0]
      const aTrack = captured.getAudioTracks()[0]
      if (!vTrack) {
        throw new Error(
          'No capturable video track (often CORS or browser policy). Try Chrome, confirm public Mux playback, or use a server-side relay.',
        )
      }

      await room.localParticipant.publishTrack(vTrack, {
        source: Track.Source.Camera,
        simulcast: false,
      })
      if (aTrack && aTrack.readyState === 'live') {
        await room.localParticipant.publishTrack(aTrack, {
          source: Track.Source.Microphone,
        })
      }

      setConnected(true)
      stopKeepalive()
      keepaliveTimerRef.current = window.setInterval(() => {
        void runKeepalive()
      }, KEEPALIVE_INTERVAL_MS)
      void runKeepalive()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      await disconnectRoom()
    } finally {
      setBusy(false)
    }
  }

  async function endStreamRemote() {
    setError(null)
    await disconnectRoom()
    const sid = streamRef.current?.id ?? stream?.id
    if (!sid) {
      setStream(null)
      setPublishInfo(null)
      streamRef.current = null
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/overshoot/streams/${encodeURIComponent(sid)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg =
          typeof body?.detail === 'string'
            ? body.detail
            : body?.error || res.statusText
        throw new Error(msg)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setStream(null)
      setPublishInfo(null)
      streamRef.current = null
      setNotice(null)
    }
  }

  async function sendChat() {
    const sid = streamRef.current?.id ?? stream?.id
    if (!sid) {
      setChatOut('Create a stream first.')
      return
    }
    setChatBusy(true)
    setChatOut('')
    try {
      const res = await fetch('/api/overshoot/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'What do you see in this frame? Answer briefly.' },
                {
                  type: 'image_url',
                  image_url: { url: `ovs://streams/${sid}?frame_index=-1` },
                },
              ],
            },
          ],
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          typeof body?.detail === 'string'
            ? body.detail
            : body?.error || res.statusText
        throw new Error(msg)
      }
      const text = body?.choices?.[0]?.message?.content
      setChatOut(typeof text === 'string' ? text : JSON.stringify(body, null, 2))
    } catch (e) {
      setChatOut(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setChatBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Overshoot.ai</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          Create an Overshoot stream, publish video over LiveKit (camera or <strong className="font-medium text-neutral-800 dark:text-neutral-200">Mux HLS</strong>
          ), keep the lease alive, then ask about frames via <span className="font-mono text-xs">ovs://</span>. Dev-only
          proxies hide your API key — in production, mirror{' '}
          <code className="rounded bg-neutral-100 px-1 font-mono text-xs dark:bg-neutral-800">/api/overshoot/*</code> on a
          backend.
        </p>
        <p className="mt-2 text-xs leading-snug text-neutral-500 dark:text-neutral-500">
          <strong className="font-medium text-neutral-700 dark:text-neutral-300">Mux HLS path:</strong> needs a{' '}
          <strong className="font-medium text-neutral-700 dark:text-neutral-300">public</strong> playback ID; we load{' '}
          <span className="font-mono">stream.mux.com/…m3u8</span>, decode in the browser, and republish with{' '}
          <span className="font-mono">captureStream</span>. Expect <strong className="font-medium text-neutral-700 dark:text-neutral-300">segment latency</strong> on top of model time — not instant like WebRTC camera. If capture fails, try
          another browser or a server-side FFmpeg relay (not included here).
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Video source</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => changeSourceMode('camera')}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              sourceMode === 'camera'
                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                : 'bg-white text-neutral-700 ring-1 ring-neutral-300 dark:bg-neutral-950 dark:text-neutral-300 dark:ring-neutral-600'
            }`}
          >
            Camera / mic
          </button>
          <button
            type="button"
            onClick={() => changeSourceMode('mux')}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              sourceMode === 'mux'
                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                : 'bg-white text-neutral-700 ring-1 ring-neutral-300 dark:bg-neutral-950 dark:text-neutral-300 dark:ring-neutral-600'
            }`}
          >
            Mux HLS (public URL)
          </button>
        </div>

        {sourceMode === 'mux' ? (
          <div className="space-y-1">
            <label htmlFor="mux-playback" className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Mux playback ID or URL
            </label>
            <input
              id="mux-playback"
              type="text"
              value={muxInput}
              onChange={(e) => setMuxInput(e.target.value)}
              placeholder="playback ID or https://player.mux.com/…"
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-xs text-neutral-900 placeholder:text-neutral-400 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
              autoComplete="off"
            />
            {muxResolved.playbackId ? (
              <p className="break-all font-mono text-[10px] text-neutral-500 dark:text-neutral-500">
                HLS manifest: {muxResolved.hlsUrl}
              </p>
            ) : muxInput.trim() ? (
              <p className="text-[11px] text-amber-800 dark:text-amber-200">
                Could not parse a playback ID — paste a raw ID, player.mux.com link, or .m3u8 URL.
              </p>
            ) : null}
          </div>
        ) : null}

        <h2 className="pt-1 text-sm font-medium text-neutral-900 dark:text-neutral-100">Stream</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void createStream()}
            className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            Create stream
          </button>
          {sourceMode === 'camera' ? (
            <button
              type="button"
              disabled={busy || !publishInfo?.token}
              onClick={() => void connectCamera()}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
            >
              Connect camera &amp; mic
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !publishInfo?.token || !muxResolved.hlsUrl}
              onClick={() => void connectMuxHls()}
              className="rounded-lg border border-emerald-600/50 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950 disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-100"
            >
              Connect Mux HLS → Overshoot
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void disconnectRoom()}
            className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 underline-offset-2 hover:underline dark:text-neutral-300"
          >
            Disconnect room
          </button>
          <button
            type="button"
            disabled={busy || !stream?.id}
            onClick={() => void endStreamRemote()}
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
          >
            End stream (delete)
          </button>
        </div>
        {notice ? <p className="text-xs text-neutral-600 dark:text-neutral-400">{notice}</p> : null}
        {connected ? (
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            LiveKit publishing · keepalive every {KEEPALIVE_INTERVAL_MS / 1000}s
          </p>
        ) : null}
        {publishInfo?.url ? (
          <p className="break-all font-mono text-[10px] text-neutral-500 dark:text-neutral-500">
            Room: {publishInfo.url}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-black aspect-video dark:border-neutral-700">
        <video ref={videoRef} className="h-full w-full object-contain" playsInline muted autoPlay />
      </div>

      <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Vision (chat completions)</h2>
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Uses <span className="font-mono">{DEFAULT_MODEL}</span> and{' '}
          <span className="font-mono">ovs://streams/&lt;id&gt;?frame_index=-1</span>. Requires frames flowing (camera or Mux
          bridge).
        </p>
        <button
          type="button"
          disabled={chatBusy || !stream?.id}
          onClick={() => void sendChat()}
          className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-emerald-600"
        >
          {chatBusy ? 'Asking…' : 'Ask: what’s in the latest frame?'}
        </button>
        {chatOut ? (
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-neutral-200 bg-white p-3 text-xs text-neutral-800 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-200">
            {chatOut}
          </pre>
        ) : null}
      </div>
    </div>
  )
}
