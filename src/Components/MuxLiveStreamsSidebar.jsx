import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  formatMuxCreatedAt,
  isMuxBroadcasting,
  pickPublicPlaybackId,
} from '../lib/muxStreams'
import { buildMuxHostedPlayerUrl, buildQrServerImageUrl, buildWatchPageUrl } from '../lib/watchUrl'

function StreamStatusBadge({ status }) {
  if (status === 'active') {
    return (
      <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-emerald-500">
        Live
      </span>
    )
  }
  if (status === 'idle') {
    return (
      <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300">
        Idle
      </span>
    )
  }
  if (status === 'disabled') {
    return (
      <span className="rounded bg-neutral-300 px-1.5 py-0.5 text-[10px] font-medium text-neutral-800 dark:bg-neutral-600 dark:text-neutral-200">
        Disabled
      </span>
    )
  }
  return (
    <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:text-neutral-400">
      {status ?? '—'}
    </span>
  )
}

function LiveStreamShareRow({ playbackId }) {
  /** Universal Mux player URL — works without hosting this app (public playback ID). */
  const muxPlayerUrl = useMemo(() => buildMuxHostedPlayerUrl(playbackId), [playbackId])
  /** This app’s /watch route — only works after you deploy at this origin. */
  const appWatchUrl = useMemo(() => buildWatchPageUrl(playbackId), [playbackId])

  const [copied, setCopied] = useState(false)
  const [copiedApp, setCopiedApp] = useState(false)
  const [qrModalOpen, setQrModalOpen] = useState(false)

  const qrImageSrc = useMemo(() => buildQrServerImageUrl(muxPlayerUrl, 220), [muxPlayerUrl])

  useEffect(() => {
    if (!qrModalOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e) {
      if (e.key === 'Escape') setQrModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [qrModalOpen])

  async function copyMuxLink() {
    if (!muxPlayerUrl) return
    try {
      await navigator.clipboard.writeText(muxPlayerUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      //
    }
  }

  async function copyAppLink() {
    if (!appWatchUrl) return
    try {
      await navigator.clipboard.writeText(appWatchUrl)
      setCopiedApp(true)
      window.setTimeout(() => setCopiedApp(false), 2000)
    } catch {
      //
    }
  }

  if (!muxPlayerUrl) return null

  const qrModal =
    qrModalOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[1px]"
            role="presentation"
            onClick={() => setQrModalOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="qr-modal-title"
              className="max-h-[90vh] max-w-sm overflow-y-auto rounded-xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-600 dark:bg-neutral-900"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="qr-modal-title" className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Scan to watch (Mux)
              </h3>
              <p className="mt-1 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                QR image from{' '}
                <span className="font-medium text-neutral-600 dark:text-neutral-300">api.qrserver.com</span>. Encodes the
                public Mux player URL below.
              </p>
              <div className="mt-4 flex justify-center rounded-lg bg-white p-3 ring-1 ring-neutral-200 dark:bg-neutral-950 dark:ring-neutral-700">
                <img
                  src={qrImageSrc}
                  alt="QR code linking to Mux player"
                  width={220}
                  height={220}
                  className="pointer-events-none h-[220px] w-[220px] max-w-full select-none object-contain"
                  draggable={false}
                  loading="eager"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <p className="mt-3 break-all font-mono text-[10px] text-neutral-500 dark:text-neutral-400">{muxPlayerUrl}</p>
              {appWatchUrl.startsWith('http') ? (
                <p className="mt-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                  This app:{' '}
                  <span className="break-all font-mono text-neutral-600 dark:text-neutral-300">{appWatchUrl}</span>
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="mt-4 w-full rounded-lg bg-neutral-900 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                Close
              </button>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div className="mt-1.5 border-t border-emerald-200/60 pt-1.5 dark:border-emerald-800/50">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => void copyMuxLink()}
          className="rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-600 dark:bg-emerald-600"
        >
          {copied ? 'Copied' : 'Share link'}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void copyAppLink()
          }}
          disabled={!appWatchUrl}
          className="rounded border border-emerald-600/50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-40 dark:border-emerald-700 dark:text-emerald-100 dark:hover:bg-emerald-950"
          title="Copy this site’s /watch URL (after deploy)"
        >
          {copiedApp ? 'Copied app' : 'App link'}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setQrModalOpen(true)
          }}
          className="rounded border border-emerald-600/50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-100 dark:hover:bg-emerald-950"
        >
          QR
        </button>
      </div>
      {qrModal}
    </div>
  )
}

/** Sidebar stream list + filters (same controls as the dashboard). */
export default function MuxLiveStreamsSidebar({
  liveStreams,
  listLoading,
  listError,
  listStatusFilter,
  setListStatusFilter,
  onRefresh,
  onNewStream,
  newStreamLoading,
  todayStreamId,
  selectedStreamId,
  onSelectStream,
}) {
  return (
    <aside className="w-full shrink-0 space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900 lg:w-80">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Live streams</h2>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <button
            type="button"
            onClick={() => void onNewStream()}
            disabled={newStreamLoading}
            className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {newStreamLoading ? 'Working…' : 'New stream'}
          </button>
          <button
            type="button"
            onClick={() => onRefresh()}
            disabled={listLoading}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-600 underline-offset-2 ring-1 ring-neutral-300 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-400 dark:ring-neutral-600 dark:hover:bg-neutral-800"
          >
            {listLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="self-center text-neutral-500 dark:text-neutral-400">Show:</span>
        <button
          type="button"
          onClick={() => setListStatusFilter('all')}
          className={`rounded-full px-2.5 py-1 font-medium ${
            listStatusFilter === 'all'
              ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
              : 'bg-white text-neutral-700 ring-1 ring-neutral-200 dark:bg-neutral-950 dark:text-neutral-300 dark:ring-neutral-600'
          }`}
        >
          All (live first)
        </button>
        <button
          type="button"
          onClick={() => setListStatusFilter('active')}
          className={`rounded-full px-2.5 py-1 font-medium ${
            listStatusFilter === 'active'
              ? 'bg-emerald-700 text-white dark:bg-emerald-600'
              : 'bg-white text-neutral-700 ring-1 ring-neutral-200 dark:bg-neutral-950 dark:text-neutral-300 dark:ring-neutral-600'
          }`}
        >
          Live only
        </button>
      </div>
      <p className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
        Status comes from Mux: <strong className="text-neutral-700 dark:text-neutral-300">Live</strong> means an
        encoder is connected; idle streams are not broadcasting yet. Use <strong className="text-neutral-700 dark:text-neutral-300">Share link</strong> on live streams for the viewer page.
      </p>
      {listError ? (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {listError}
        </p>
      ) : null}
      <ul className="max-h-[min(60vh,28rem)] space-y-1 overflow-y-auto pr-1 text-sm">
        {liveStreams.length === 0 && !listLoading ? (
          <li className="text-xs text-neutral-500">
            {listStatusFilter === 'active'
              ? 'No streams are broadcasting right now (nothing with Mux status “active”).'
              : 'No streams returned.'}
          </li>
        ) : (
          liveStreams.map((s) => {
            const pid = pickPublicPlaybackId(s)
            const isTodaySaved = todayStreamId && s.id === todayStreamId
            const isSelected = selectedStreamId === s.id
            const broadcasting = isMuxBroadcasting(s)
            return (
              <li key={s.id}>
                <div
                  className={`w-full rounded-md border text-left text-xs transition-colors ${
                    isSelected
                      ? 'border-neutral-800 bg-neutral-200 dark:border-neutral-300 dark:bg-neutral-800'
                      : broadcasting
                        ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/30'
                        : 'border-transparent bg-white dark:bg-neutral-950'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectStream(s)}
                    className="w-full rounded-md px-2 py-2 text-left hover:bg-white/50 dark:hover:bg-neutral-800/50"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StreamStatusBadge status={s.status} />
                      <span className="font-mono text-[11px] text-neutral-800 dark:text-neutral-200">
                        {s.id?.slice(0, 12)}…
                      </span>
                      {isTodaySaved ? (
                        <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                          Today
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[11px] text-neutral-500">{formatMuxCreatedAt(s.created_at)}</div>
                    {pid ? (
                      <div className="mt-0.5 font-mono text-[10px] text-neutral-400">playback {pid.slice(0, 10)}…</div>
                    ) : null}
                  </button>
                  {broadcasting && pid ? (
                    <div className="px-2 pb-2">
                      <LiveStreamShareRow playbackId={pid} />
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })
        )}
      </ul>
    </aside>
  )
}
