import { useState } from 'react'
import MuxMediaPlayer from './MuxMediaPlayer'

const MUX_RTMP_URL = 'rtmps://global-live.mux.com:443/app'

function pickPublicPlaybackId(data) {
  if (!data?.playback_ids?.length) return null
  const pub = data.playback_ids.find((p) => p.policy === 'public')
  return pub?.id ?? data.playback_ids[0]?.id ?? null
}

export default function LiveStreamCreator() {
  const [playbackId, setPlaybackId] = useState(null)
  const [playerReloadNonce, setPlayerReloadNonce] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [streamKey, setStreamKey] = useState(null)
  const [raw, setRaw] = useState(null)

  function retryPlayerConnection() {
    setPlayerReloadNonce((n) => n + 1)
  }

  async function createLiveStream() {
    setLoading(true)
    setError(null)
    setStreamKey(null)
    setRaw(null)
    try {
      const res = await fetch('/api/mux/live-streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          body?.error?.messages?.join?.('; ') ||
          body?.error ||
          body?.message ||
          res.statusText
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      }
      const data = body.data
      setRaw(data)
      const pid = pickPublicPlaybackId(data)
      if (pid) {
        setPlayerReloadNonce(0)
        setPlaybackId(pid)
      }
      if (data?.stream_key) setStreamKey(data.stream_key)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <MuxMediaPlayer playbackId={playbackId} reloadNonce={playerReloadNonce} />
        {playbackId && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-600 dark:text-neutral-400">
            <button
              type="button"
              onClick={retryPlayerConnection}
              className="rounded border border-neutral-300 bg-white px-3 py-1.5 font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
            >
              Retry connection
            </button>
            <span className="text-xs">
              Use if the player keeps spinning — remounts the player so it fetches the live manifest again (no need to wait on the default backoff).
            </span>
          </div>
        )}
      </div>
      <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-700 dark:bg-neutral-900">
      <p className="font-medium text-neutral-800 dark:text-neutral-200">
        Create a Mux live stream (dev only — uses Vite proxy; deploy a real backend for production).
      </p>
      <button
        type="button"
        onClick={createLiveStream}
        disabled={loading}
        className="rounded bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {loading ? 'Creating…' : 'Create live stream'}
      </button>
      {error && (
        <p className="text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      {streamKey && (
        <div className="space-y-1 font-mono text-xs text-neutral-700 dark:text-neutral-300">
          <p>
            <span className="text-neutral-500">RTMP URL</span>
            <br />
            {MUX_RTMP_URL}
          </p>
          <p>
            <span className="text-neutral-500">Stream key</span> (keep private)
            <br />
            {streamKey}
          </p>
        </div>
      )}
      {raw?.id && (
        <p className="text-xs text-neutral-500">
          Live stream id: <span className="font-mono text-neutral-700 dark:text-neutral-300">{raw.id}</span>
        </p>
      )}
      {playbackId && (
        <p className="text-xs text-neutral-500">
          Playback ID: <span className="font-mono text-neutral-700 dark:text-neutral-300">{playbackId}</span>
        </p>
      )}
      </div>
    </div>
  )
}
