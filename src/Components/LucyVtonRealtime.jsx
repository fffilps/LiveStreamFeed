import { fal } from '@fal-ai/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import promptsRaw from '../../prompts.txt?raw'
import {
  STYLE_BUTTONS,
  THING_BUTTONS,
  buildFacePrompt,
  parseFacePrompts,
} from '../lib/facePromptConfig'
import LucyObsCaptureHint from './LucyObsCaptureHint'

const MODEL_ID = 'decart/lucy2-vton/realtime'

const DEFAULT_PROMPT =
  'Substitute the current face/head with the character from the reference image, matching its color, material, and fit'

/** Build absolute URL for fal (must fetch server-side when not on localhost). */
function absoluteUrlForPublicPath(path) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (typeof window === 'undefined') return normalized
  return new URL(normalized, window.location.origin).href
}

function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const r = fr.result
      if (typeof r === 'string') resolve(r)
      else reject(new Error('Failed to read reference image'))
    }
    fr.onerror = () => reject(new Error('Failed to read reference image'))
    fr.readAsDataURL(blob)
  })
}

/**
 * Lucy accepts HTTPS URLs or data: URIs (see fal realtime docs).
 * Non-HTTPS URLs are fetched in-browser, then uploaded via `fal.storage.upload` — same idea as dropping a file in the
 * [playground](https://fal.ai/models/decart/lucy2-vton/realtime/playground), which stores the image and passes an HTTPS URL to the model.
 * If upload fails, falls back to a data URI.
 */
async function resolveLucyReferenceImageUrl(url) {
  const trimmed = typeof url === 'string' ? url.trim() : ''
  if (!trimmed) return ''

  if (/^data:image\//i.test(trimmed)) return trimmed

  if (/^https:\/\//i.test(trimmed)) return trimmed

  const abs = absoluteUrlForPublicPath(trimmed)

  if (/^https:\/\//i.test(abs)) return abs

  const res = await fetch(abs, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Could not load reference image (${res.status}). Check the file exists under public/.`)
  }
  const blob = await res.blob()
  if (!blob.type.startsWith('image/')) {
    throw new Error('Reference file must be an image (JPEG, PNG, etc.).')
  }

  try {
    const uploaded = await fal.storage.upload(blob, {
      lifecycle: { expiresIn: '7d' },
    })
    if (typeof uploaded === 'string' && /^https:\/\//i.test(uploaded)) {
      return uploaded
    }
  } catch {
    //
  }

  return blobToDataUri(blob)
}

/**
 * Lucy 2.1 virtual try-on over WebRTC via fal realtime — see
 * https://fal.ai/models/decart/lucy2-vton/realtime/playground
 *
 * Requires `VITE_FAL_KEY` in `.env` / `local.env` (Vite exposes only `VITE_*` to the client).
 */
export default function LucyVtonRealtime() {
  const inputVideoRef = useRef(null)
  const outputVideoRef = useRef(null)
  const streamRef = useRef(null)
  const pcRef = useRef(null)
  const falConnRef = useRef(null)

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [referenceImageUrl, setReferenceImageUrl] = useState('')
  const [referenceOptions, setReferenceOptions] = useState(
    /** @type {{ id: string; label: string; file: string; previewSrc: string; falFetchUrl: string }[]} */ ([]),
  )
  const [selectedRefId, setSelectedRefId] = useState('')
  const [status, setStatus] = useState('idle')
  const [sessionActive, setSessionActive] = useState(false)
  const [error, setError] = useState(null)

  const faceConfig = useMemo(() => parseFacePrompts(promptsRaw), [])
  const [selectedStyleId, setSelectedStyleId] = useState(() =>
    STYLE_BUTTONS.some((s) => s.id === faceConfig.defaultStyle)
      ? faceConfig.defaultStyle
      : STYLE_BUTTONS[0].id,
  )
  const [selectedThingId, setSelectedThingId] = useState(() =>
    THING_BUTTONS.some((t) => t.id === faceConfig.defaultThing)
      ? faceConfig.defaultThing
      : THING_BUTTONS[0].id,
  )
  const [generatingFlux, setGeneratingFlux] = useState(false)
  const [lastGeneratedUrl, setLastGeneratedUrl] = useState(null)

  const falKey = import.meta.env.VITE_FAL_KEY

  const fluxPromptPreview = useMemo(
    () => buildFacePrompt(faceConfig.template, selectedStyleId, selectedThingId),
    [faceConfig.template, selectedStyleId, selectedThingId],
  )

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (inputVideoRef.current) inputVideoRef.current.srcObject = null
    if (outputVideoRef.current) outputVideoRef.current.srcObject = null
  }, [])

  const teardown = useCallback(() => {
    pcRef.current?.close()
    pcRef.current = null
    falConnRef.current?.close()
    falConnRef.current = null
    stopTracks()
    setStatus('idle')
    setSessionActive(false)
  }, [stopTracks])

  useEffect(() => () => teardown(), [teardown])

  const refreshReferenceOptions = useCallback(async (opts = {}) => {
    const { selectFirst = false, preferredId } = opts
    try {
      const res = await fetch(`/reference-images/manifest.json?t=${Date.now()}`, {
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = await res.json()
      const images = Array.isArray(data.images) ? data.images : []
      const mapped = images
        .filter((item) => item.file && item.id)
        .map((item) => {
          const previewSrc = `/reference-images/${item.file}`
          const falFetchUrl =
            typeof item.sourceUrl === 'string' && item.sourceUrl.trim()
              ? item.sourceUrl.trim()
              : absoluteUrlForPublicPath(previewSrc)
          return {
            id: item.id,
            label: item.label || item.file,
            file: item.file,
            previewSrc,
            falFetchUrl,
          }
        })
      setReferenceOptions(mapped)

      if (preferredId) {
        const found = mapped.find((o) => o.id === preferredId)
        if (found) {
          setSelectedRefId(found.id)
          setReferenceImageUrl(found.falFetchUrl)
          return
        }
      }
      if (selectFirst && mapped[0]) {
        setSelectedRefId(mapped[0].id)
        setReferenceImageUrl(mapped[0].falFetchUrl)
      }
    } catch {
      //
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      void refreshReferenceOptions({ selectFirst: true })
    }, 0)
    return () => clearTimeout(t)
  }, [refreshReferenceOptions])

  const handleResult = useCallback(async (result) => {
    const stream = streamRef.current
    const connection = falConnRef.current
    if (!connection) return

    try {
      switch (result.type) {
        case 'iceservers':
        case 'iceServers': {
          const raw =
            result.iceservers || result.iceServers || result.ice_servers
          const servers = Array.isArray(raw)
            ? raw.map((s) => ({
                urls: s.urls ?? s.url,
                username: s.username,
                credential: s.credential,
              }))
            : []

          if (!stream) {
            setError('Camera stream missing when setting up WebRTC.')
            return
          }

          if (pcRef.current) {
            pcRef.current.close()
          }

          const pc = new RTCPeerConnection({ iceServers: servers })
          pcRef.current = pc

          stream.getTracks().forEach((track) => pc.addTrack(track, stream))

          pc.ontrack = (e) => {
            if (outputVideoRef.current && e.streams[0]) {
              outputVideoRef.current.srcObject = e.streams[0]
            }
          }

          pc.onicecandidate = (e) => {
            if (e.candidate) {
              connection.send({
                type: 'icecandidate',
                candidate: {
                  candidate: e.candidate.candidate,
                  sdpMid: e.candidate.sdpMid,
                  sdpMLineIndex: e.candidate.sdpMLineIndex,
                },
              })
            }
          }

          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          connection.send({ type: 'offer', sdp: offer.sdp })
          break
        }
        case 'answer':
          if (pcRef.current && result.sdp) {
            await pcRef.current.setRemoteDescription({ type: 'answer', sdp: result.sdp })
          }
          break
        case 'icecandidate':
          if (pcRef.current && result.candidate) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(result.candidate))
          }
          break
        case 'ice-restart':
          if (result.turn_config && pcRef.current) {
            pcRef.current.setConfiguration({
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                {
                  urls: result.turn_config.server_url,
                  username: result.turn_config.username,
                  credential: result.turn_config.credential,
                },
              ],
            })
            const offer = await pcRef.current.createOffer({ iceRestart: true })
            await pcRef.current.setLocalDescription(offer)
            connection.send({ type: 'offer', sdp: offer.sdp })
          }
          break
        case 'prompt_ack':
          if (!result.success) setError(result.error ? String(result.error) : 'Prompt rejected')
          break
        case 'set_image_ack':
          if (!result.success) setError(result.error ? String(result.error) : 'Image update rejected')
          break
        case 'generation_started':
          setStatus('streaming')
          break
        case 'error':
          setError(result.error ? String(result.error) : 'Realtime error')
          break
        default:
          break
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  async function startSession() {
    setError(null)

    if (!falKey || String(falKey).trim() === '') {
      setError('Add VITE_FAL_KEY to .env (see fal.ai dashboard) and restart Vite.')
      return
    }

    teardown()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: true,
      })
      streamRef.current = stream
      if (inputVideoRef.current) inputVideoRef.current.srcObject = stream

      fal.config({ credentials: falKey })

      const connection = fal.realtime.connect(MODEL_ID, {
        connectionKey: `lucy-${Date.now()}`,
        throttleInterval: 0,
        onResult: handleResult,
        onError: (err) => {
          setError(err instanceof Error ? err.message : String(err))
        },
      })

      falConnRef.current = connection

      const payload = { prompt }
      const refUrl = referenceImageUrl.trim()
      if (refUrl) {
        try {
          payload.reference_image_url = await resolveLucyReferenceImageUrl(refUrl)
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          teardown()
          return
        }
      }

      connection.send(payload)
      setSessionActive(true)
      setStatus('connecting')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      teardown()
    }
  }

  function sendPromptUpdate() {
    const connection = falConnRef.current
    if (!connection) return
    connection.send({
      prompt,
      enhance_prompt: true,
    })
  }

  async function sendReferenceUpdate() {
    const connection = falConnRef.current
    if (!connection) return
    const payload = {
      prompt,
      enhance_prompt: true,
    }
    const refUrl = referenceImageUrl.trim()
    if (refUrl) {
      setError(null)
      try {
        payload.reference_image_url = await resolveLucyReferenceImageUrl(refUrl)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        return
      }
    }
    connection.send(payload)
  }

  function selectReferenceOption(id) {
    const opt = referenceOptions.find((o) => o.id === id)
    if (!opt) return
    setSelectedRefId(id)
    setReferenceImageUrl(opt.falFetchUrl)
  }

  /** Push reference image + prompt to Lucy mid-session (see fal realtime docs). */
  async function pushLucyReferenceFromUrl(imageUrl) {
    const connection = falConnRef.current
    if (!connection || !sessionActive || !imageUrl?.trim()) return
    setError(null)
    let ref
    try {
      ref = await resolveLucyReferenceImageUrl(imageUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    }
    connection.send({
      reference_image_url: ref,
      prompt,
      enhance_prompt: true,
    })
  }

  async function generateAiFaceReference() {
    if (!falKey || String(falKey).trim() === '') {
      setError('Add VITE_FAL_KEY to run Flux.')
      return
    }
    setError(null)
    setGeneratingFlux(true)
    fal.config({ credentials: falKey })
    try {
      const result = await fal.subscribe(faceConfig.fluxEndpoint, {
        input: {
          prompt: fluxPromptPreview,
          image_size: 'square_hd',
          num_inference_steps: 4,
          num_images: 1,
          output_format: 'png',
        },
      })
      const url = result.data?.images?.[0]?.url
      if (!url) throw new Error('Flux returned no image URL')

      pushLucyReferenceFromUrl(url)

      const label = `Styleface · ${STYLE_BUTTONS.find((s) => s.id === selectedStyleId)?.label ?? selectedStyleId} · ${THING_BUTTONS.find((t) => t.id === selectedThingId)?.label ?? selectedThingId}`
      const saveRes = await fetch('/api/reference-images/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: url, label }),
      })
      const savePayload = await saveRes.json().catch(() => ({}))
      if (!saveRes.ok) {
        throw new Error(
          typeof savePayload.error === 'string' ? savePayload.error : `Save failed (${saveRes.status})`,
        )
      }
      const entry = savePayload.entry
      if (!entry?.id || !entry?.file) throw new Error('Save returned no entry')

      const localPreview = absoluteUrlForPublicPath(`/reference-images/${entry.file}`)
      setLastGeneratedUrl(`${localPreview}?t=${Date.now()}`)
      await refreshReferenceOptions({ preferredId: entry.id })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGeneratingFlux(false)
    }
  }

  const busy = status === 'connecting' || status === 'streaming'

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Camera (input)
          </p>
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-black dark:border-neutral-700">
            <video
              ref={inputVideoRef}
              autoPlay
              playsInline
              muted
              className="aspect-video w-full object-contain"
            />
          </div>
        </div>
        <div id="lucy-output-region">
          <p className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Lucy output — OBS captures this panel
          </p>
          <div className="overflow-hidden rounded-lg border-2 border-fuchsia-500/70 bg-black shadow-[inset_0_0_0_1px_rgba(217,70,239,0.35)] dark:border-fuchsia-500/60">
            <video
              id="lucy-output-video"
              ref={outputVideoRef}
              autoPlay
              playsInline
              className="aspect-video w-full object-contain"
            />
          </div>
          <LucyObsCaptureHint variant="embedded" />
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
          Prompt
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-900"
          />
        </label>

        <div className="rounded-xl border border-indigo-200 bg-indigo-50/90 p-4 dark:border-indigo-900 dark:bg-indigo-950/40">
          <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
            Generate reference face (from <code className="rounded bg-white/80 px-1 dark:bg-neutral-800">prompts.txt</code>)
          </p>
          <p className="mt-1 text-[11px] leading-snug text-neutral-600 dark:text-neutral-400">
            Template + Flux model come from your project <code className="rounded bg-white/70 px-1 dark:bg-neutral-800">prompts.txt</code>. Pick one style and one subject, then generate. If Lucy is already connected, the new image is sent like{' '}
            <a
              href="https://fal.ai/models/decart/lucy2-vton/realtime/playground"
              className="font-medium text-indigo-700 underline dark:text-indigo-400"
              target="_blank"
              rel="noreferrer"
            >
              “Update Reference Image Mid-Session”
            </a>
            .
          </p>
          <p className="mt-2 font-mono text-[11px] text-neutral-700 dark:text-neutral-300">{fluxPromptPreview}</p>
          <p className="mt-0.5 text-[10px] text-neutral-500">
            Model: <code className="rounded bg-white/70 px-1 dark:bg-neutral-800">{faceConfig.fluxEndpoint}</code>
          </p>

          <div className="mt-3 space-y-2">
            <p className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Style</p>
            <div className="flex flex-wrap gap-2">
              {STYLE_BUTTONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStyleId(s.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    selectedStyleId === s.id
                      ? 'bg-indigo-700 text-white dark:bg-indigo-600'
                      : 'bg-white text-neutral-800 ring-1 ring-neutral-300 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-200 dark:ring-neutral-600'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <p className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Subject</p>
            <div className="flex flex-wrap gap-2">
              {THING_BUTTONS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedThingId(t.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    selectedThingId === t.id
                      ? 'bg-teal-700 text-white dark:bg-teal-600'
                      : 'bg-white text-neutral-800 ring-1 ring-neutral-300 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-200 dark:ring-neutral-600'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void generateAiFaceReference()}
            disabled={generatingFlux || !falKey}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {generatingFlux ? 'Generating with Flux…' : 'Generate face & use as reference'}
          </button>

          {lastGeneratedUrl ? (
            <div className="mt-3 flex items-start gap-3">
              <img
                src={lastGeneratedUrl}
                alt="Last generated reference"
                className="h-20 w-20 rounded-md border border-neutral-200 object-cover dark:border-neutral-600"
              />
              <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                Saved copy under <code className="rounded bg-white/70 px-1 dark:bg-neutral-800">public/reference-images</code> (gallery updates automatically). Lucy still uses the remote fal image URL for{' '}
                <code className="rounded bg-white/70 px-1 dark:bg-neutral-800">reference_image_url</code> so fal can fetch it.
              </p>
            </div>
          ) : null}
        </div>

        <div>
          <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Reference character (from <code className="rounded bg-neutral-200 px-1 text-[11px] dark:bg-neutral-800">public/reference-images</code>)
          </p>
          {referenceOptions.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">
              Add JPG/PNG files under <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">public/reference-images/</code> and list them in{' '}
              <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">manifest.json</code>.
            </p>
          ) : (
            <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {referenceOptions.map((opt) => {
                const selected = selectedRefId === opt.id
                return (
                  <li key={opt.id}>
                    <button
                      type="button"
                      onClick={() => selectReferenceOption(opt.id)}
                      className={`w-full overflow-hidden rounded-lg border-2 text-left transition-colors ${
                        selected
                          ? 'border-fuchsia-600 ring-2 ring-fuchsia-400/40 dark:border-fuchsia-500'
                          : 'border-neutral-200 hover:border-neutral-400 dark:border-neutral-600 dark:hover:border-neutral-500'
                      }`}
                    >
                      <img
                        src={opt.previewSrc}
                        alt={opt.label}
                        className="aspect-[3/4] w-full object-cover"
                      />
                      <span className="block truncate px-2 py-1.5 text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
                        {opt.label}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
          Reference image URL (override — optional)
          <input
            type="url"
            value={referenceImageUrl}
            onChange={(e) => {
              setReferenceImageUrl(e.target.value)
              setSelectedRefId('')
            }}
            placeholder="https://… or leave selection above"
            className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-900"
          />
        </label>
        <p className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
          Non-<code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">https</code> references are fetched and
          uploaded with <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">fal.storage.upload</code> so fal
          receives the same kind of <strong className="font-medium text-neutral-600 dark:text-neutral-300">HTTPS URL</strong> as the{' '}
          <a
            href="https://fal.ai/models/decart/lucy2-vton/realtime/playground"
            className="font-medium text-violet-700 underline dark:text-violet-400"
            target="_blank"
            rel="noreferrer"
          >
            Lucy playground
          </a>{' '}
          uses after you drop an image (fallback: inline data URI if upload fails).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void startSession()}
          disabled={busy}
          className="rounded-lg bg-fuchsia-700 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-600 disabled:opacity-50"
        >
          {busy ? 'Session active…' : 'Start head swap'}
        </button>
        <button
          type="button"
          onClick={teardown}
          disabled={!sessionActive}
          className="rounded-lg border border-neutral-400 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
        >
          Disconnect
        </button>
        <button
          type="button"
          onClick={sendPromptUpdate}
          disabled={!sessionActive}
          className="rounded-lg bg-neutral-200 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-300 disabled:opacity-50 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600"
        >
          Update prompt
        </button>
        <button
          type="button"
          onClick={() => void sendReferenceUpdate()}
          disabled={!sessionActive}
          className="rounded-lg bg-neutral-200 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-300 disabled:opacity-50 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600"
        >
          Update reference
        </button>
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Status: <span className="font-medium text-neutral-700 dark:text-neutral-300">{status}</span>
        {' · '}
        Billed per fal pricing (~$0.02/s while running). Requires HTTPS or localhost for camera.
      </p>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {!falKey ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          Set <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">VITE_FAL_KEY</code> in{' '}
          <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">.env</code> (copy from{' '}
          <a
            href="https://fal.ai/dashboard"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            fal dashboard
          </a>
          ) and restart <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">npm run dev</code>.
        </p>
      ) : null}
    </div>
  )
}
