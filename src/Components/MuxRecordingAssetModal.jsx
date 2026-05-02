import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import MuxMediaPlayer from './MuxMediaPlayer'
import { formatMuxCreatedAt } from '../lib/muxStreams'
import { formatAssetDurationSeconds, pickAssetPlaybackId } from '../lib/muxAssets'

const FIND_KEY_MOMENTS_DOC = 'https://www.mux.com/docs/guides/robots-find-key-moments'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default function MuxRecordingAssetModal({ asset, onClose }) {
  const [momentsJob, setMomentsJob] = useState(
    /** @type {'idle' | 'running' | 'done' | 'error'} */ ('idle'),
  )
  const [momentsError, setMomentsError] = useState(null)
  const [moments, setMoments] = useState(/** @type {unknown[] | null} */ (null))

  const playbackId = asset ? pickAssetPlaybackId(asset) : null

  useEffect(() => {
    if (!asset) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [asset, onClose])

  async function runFindKeyMoments() {
    if (!asset?.id) return
    setMomentsJob('running')
    setMomentsError(null)
    setMoments(null)
    try {
      const res = await fetch('/api/mux/robots/jobs/find-key-moments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parameters: {
            asset_id: asset.id,
            max_moments: 5,
          },
        }),
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
      const jobId = body?.data?.id
      if (!jobId || typeof jobId !== 'string') {
        throw new Error('Mux did not return a job id')
      }

      for (let i = 0; i < 90; i++) {
        await sleep(2000)
        const jr = await fetch(
          `/api/mux/robots/jobs/find-key-moments/${encodeURIComponent(jobId)}`,
        )
        const jb = await jr.json().catch(() => ({}))
        if (!jr.ok) {
          const msg =
            jb?.error?.messages?.join?.('; ') ||
            jb?.error ||
            jb?.message ||
            jr.statusText
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
        }
        const st = jb?.data?.status
        if (st === 'completed') {
          const list = jb?.data?.outputs?.moments
          setMoments(Array.isArray(list) ? list : [])
          setMomentsJob('done')
          return
        }
        if (st === 'errored') {
          const errObj = jb?.data?.errors
          const msg =
            typeof errObj === 'string'
              ? errObj
              : errObj != null
                ? JSON.stringify(errObj)
                : 'Job errored'
          throw new Error(msg)
        }
        if (st === 'cancelled') {
          throw new Error('Job was cancelled')
        }
      }
      throw new Error('Timed out waiting for key moments job')
    } catch (e) {
      setMomentsJob('error')
      setMomentsError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!asset || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mux-asset-modal-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-neutral-600 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="mux-asset-modal-title" className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Recording
            </h2>
            <p className="mt-0.5 font-mono text-[11px] text-neutral-500 dark:text-neutral-400">{asset.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800"
          >
            Close
          </button>
        </div>

        <dl className="mt-3 grid grid-cols-1 gap-1 text-xs text-neutral-600 dark:text-neutral-400 sm:grid-cols-2">
          <div>
            <dt className="text-neutral-500">Created</dt>
            <dd>{formatMuxCreatedAt(asset.created_at)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Duration</dt>
            <dd>{formatAssetDurationSeconds(asset.duration)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Status</dt>
            <dd className="capitalize">{asset.status ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Ingest</dt>
            <dd className="font-mono text-[10px]">{asset.ingest_type ?? '—'}</dd>
          </div>
        </dl>

        <div className="mt-4">
          {playbackId ? (
            <MuxMediaPlayer
              playbackId={playbackId}
              streamType="on-demand"
              videoTitle={`Asset ${asset.id?.slice(0, 8) ?? ''}`}
            />
          ) : (
            <p className="text-sm text-amber-800 dark:text-amber-200">
              No public playback id on this asset — open it in the Mux dashboard to check playback policies.
            </p>
          )}
        </div>

        <div className="mt-5 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-950/50">
          <p className="text-xs leading-snug text-neutral-600 dark:text-neutral-400">
            <strong className="font-medium text-neutral-800 dark:text-neutral-200">Find key moments</strong> uses the{' '}
            <a
              href={FIND_KEY_MOMENTS_DOC}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-700 underline underline-offset-2 hover:text-emerald-800 dark:text-emerald-400"
            >
              Mux Robots API
            </a>
            . Mux recommends captions on the asset first (auto or manual).
          </p>
          <button
            type="button"
            disabled={momentsJob === 'running' || !asset.id}
            onClick={() => void runFindKeyMoments()}
            className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {momentsJob === 'running' ? 'Analyzing… (can take a minute)' : 'Find key moments'}
          </button>
          {momentsError ? (
            <p className="text-xs text-red-600 dark:text-red-400" role="alert">
              {momentsError}
            </p>
          ) : null}
          {momentsJob === 'done' && moments && moments.length === 0 ? (
            <p className="text-xs text-neutral-600 dark:text-neutral-400">Job finished but returned no moments.</p>
          ) : null}
          {moments && moments.length > 0 ? (
            <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto text-xs">
              {moments.map((m, idx) => {
                const row = /** @type {{ title?: string; start_ms?: number; end_ms?: number; overall_score?: number; audible_narrative?: string }} */ (
                  m && typeof m === 'object' ? m : {}
                )
                return (
                  <li
                    key={`${row.start_ms ?? idx}-${row.end_ms ?? idx}`}
                    className="rounded-md border border-neutral-200 bg-white p-2 dark:border-neutral-600 dark:bg-neutral-900"
                  >
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">{row.title ?? `Moment ${idx + 1}`}</p>
                    <p className="mt-0.5 text-[10px] text-neutral-500">
                      {row.start_ms != null && row.end_ms != null
                        ? `${(row.start_ms / 1000).toFixed(1)}s – ${(row.end_ms / 1000).toFixed(1)}s`
                        : ''}
                      {row.overall_score != null ? ` · score ${row.overall_score.toFixed(2)}` : ''}
                    </p>
                    {row.audible_narrative ? (
                      <p className="mt-1 text-neutral-600 dark:text-neutral-400">{row.audible_narrative}</p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
