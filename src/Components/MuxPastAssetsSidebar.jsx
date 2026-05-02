import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatMuxCreatedAt } from '../lib/muxStreams'
import {
  formatAssetDurationSeconds,
  isLikelyLiveRecording,
  pickAssetPlaybackId,
  sortAssetsNewestFirst,
} from '../lib/muxAssets'
import MuxRecordingAssetModal from './MuxRecordingAssetModal'

export default function MuxPastAssetsSidebar() {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  /** `live` = likely live-stream recordings; `all` = every ready asset */
  const [filter, setFilter] = useState(/** @type {'live' | 'all'} */ ('live'))
  const [modalAsset, setModalAsset] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '50' })
      const res = await fetch(`/api/mux/assets?${params}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          body?.error?.messages?.join?.('; ') ||
          body?.error ||
          body?.message ||
          res.statusText
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      }
      const rows = Array.isArray(body.data) ? body.data : []
      let ready = rows.filter((a) => a?.status === 'ready')
      if (filter === 'live') {
        ready = ready.filter(isLikelyLiveRecording)
      }
      setAssets(sortAssetsNewestFirst(ready))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setAssets([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0)
    return () => clearTimeout(t)
  }, [refresh])

  const emptyHint = useMemo(() => {
    if (filter !== 'live') return null
    return (
      <p className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
        No live-recording assets match. Try <strong className="font-medium text-neutral-700 dark:text-neutral-300">All ready</strong>{' '}
        to include uploads and other ingest types.
      </p>
    )
  }, [filter])

  return (
    <>
      <aside className="w-full shrink-0 space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900 lg:w-80">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Past recordings</h2>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-600 underline-offset-2 ring-1 ring-neutral-300 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-400 dark:ring-neutral-600 dark:hover:bg-neutral-800"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="self-center text-neutral-500 dark:text-neutral-400">Show:</span>
          <button
            type="button"
            onClick={() => setFilter('live')}
            className={`rounded-full px-2.5 py-1 font-medium ${
              filter === 'live'
                ? 'bg-emerald-700 text-white dark:bg-emerald-600'
                : 'bg-white text-neutral-700 ring-1 ring-neutral-200 dark:bg-neutral-950 dark:text-neutral-300 dark:ring-neutral-600'
            }`}
          >
            Live recordings
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-full px-2.5 py-1 font-medium ${
              filter === 'all'
                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                : 'bg-white text-neutral-700 ring-1 ring-neutral-200 dark:bg-neutral-950 dark:text-neutral-300 dark:ring-neutral-600'
            }`}
          >
            All ready
          </button>
        </div>

        <p className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
          Finished live streams become <strong className="font-medium text-neutral-700 dark:text-neutral-300">assets</strong> in Mux.
          Click one to play the VOD and run{' '}
          <strong className="font-medium text-neutral-700 dark:text-neutral-300">Find key moments</strong>.
        </p>

        {error ? (
          <p className="text-xs text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <ul className="max-h-[min(60vh,28rem)] space-y-1 overflow-y-auto pr-1 text-sm">
          {assets.length === 0 && !loading ? (
            <li className="space-y-2 text-xs text-neutral-500">
              <span>No assets to show.</span>
              {emptyHint}
            </li>
          ) : (
            assets.map((a) => {
              const pid = pickAssetPlaybackId(a)
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setModalAsset(a)}
                    className="w-full rounded-md border border-transparent bg-white px-2 py-2 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-100 dark:bg-neutral-950 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/80"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200">
                        VOD
                      </span>
                      {isLikelyLiveRecording(a) ? (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
                          Live
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-neutral-800 dark:text-neutral-200">
                      {a.id?.slice(0, 14)}…
                    </div>
                    <div className="mt-0.5 text-[11px] text-neutral-500">
                      {formatMuxCreatedAt(a.created_at)} · {formatAssetDurationSeconds(a.duration)}
                    </div>
                    {pid ? (
                      <div className="mt-0.5 font-mono text-[10px] text-neutral-400">playback {pid.slice(0, 10)}…</div>
                    ) : (
                      <div className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-300">No public playback</div>
                    )}
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </aside>

      {modalAsset ? (
        <MuxRecordingAssetModal key={modalAsset.id} asset={modalAsset} onClose={() => setModalAsset(null)} />
      ) : null}
    </>
  )
}
