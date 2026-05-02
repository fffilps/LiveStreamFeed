import { useCallback, useEffect, useState } from 'react'

const DEFAULT_BASE =
  typeof import.meta.env.VITE_STREAM_COMPANION_URL === 'string'
    ? import.meta.env.VITE_STREAM_COMPANION_URL.replace(/\/$/, '')
    : 'http://127.0.0.1:54781'

export default function FfmpegCompanionControls() {
  const [running, setRunning] = useState(false)
  const [pid, setPid] = useState(null)
  const [busy, setBusy] = useState(false)
  const [offline, setOffline] = useState(false)
  const [lastError, setLastError] = useState(null)

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`${DEFAULT_BASE}/api/stream/status`)
      if (!res.ok) throw new Error(res.statusText)
      const body = await res.json()
      setRunning(Boolean(body.running))
      setPid(body.pid ?? null)
      setOffline(false)
    } catch {
      setOffline(true)
      setRunning(false)
      setPid(null)
    }
  }, [])

  useEffect(() => {
    const boot = setTimeout(() => void pollStatus(), 0)
    const id = setInterval(() => void pollStatus(), 4000)
    return () => {
      clearTimeout(boot)
      clearInterval(id)
    }
  }, [pollStatus])

  async function startStream() {
    setBusy(true)
    setLastError(null)
    try {
      const res = await fetch(`${DEFAULT_BASE}/api/stream/start`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.error || res.statusText || 'start failed')
      }
      await pollStatus()
    } catch (e) {
      const msg =
        e instanceof TypeError && e.message === 'Failed to fetch'
          ? 'Companion not running — start `npm run stream:companion` in a terminal.'
          : e instanceof Error
            ? e.message
            : String(e)
      setLastError(msg)
    } finally {
      setBusy(false)
    }
  }

  async function stopStream() {
    setBusy(true)
    setLastError(null)
    try {
      const res = await fetch(`${DEFAULT_BASE}/api/stream/stop`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.error || res.statusText || 'stop failed')
      }
      await pollStatus()
    } catch (e) {
      const msg =
        e instanceof TypeError && e.message === 'Failed to fetch'
          ? 'Companion not running.'
          : e instanceof Error
            ? e.message
            : String(e)
      setLastError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/80 p-4 text-sm dark:border-violet-800 dark:bg-violet-950/40">
      <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
        Camera → Mux (this Mac)
      </h3>
      <p className="text-xs leading-snug text-neutral-600 dark:text-neutral-400">
        Browsers cannot start FFmpeg. Run{' '}
        <code className="rounded bg-neutral-200/80 px-1 dark:bg-neutral-800">npm run stream:companion</code>{' '}
        in a terminal, keep it open, then use the buttons here. Uses{' '}
        <code className="rounded bg-neutral-200/80 px-1 dark:bg-neutral-800">MUX_STREAM_KEY</code> from{' '}
        <code className="rounded bg-neutral-200/80 px-1 dark:bg-neutral-800">local.env</code>.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void startStream()}
          disabled={busy || running || offline}
          className="rounded-md bg-violet-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-600 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
        >
          {busy ? '…' : 'Start camera stream'}
        </button>
        <button
          type="button"
          onClick={() => void stopStream()}
          disabled={busy || !running}
          className="rounded-md border border-neutral-400 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
        >
          Stop stream
        </button>
        <span className="text-xs text-neutral-600 dark:text-neutral-400">
          {offline
            ? 'Companion offline'
            : running
              ? `Streaming (pid ${pid ?? '?'})`
              : 'Idle'}
        </span>
      </div>
      {lastError ? (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {lastError}
        </p>
      ) : null}
    </div>
  )
}
