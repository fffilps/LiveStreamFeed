import { useCallback, useEffect, useState } from 'react'
import MuxMediaPlayer from './MuxMediaPlayer'
import { getLocalDayKey, loadTodaySession, saveTodaySession } from '../lib/muxDailySession'

const MUX_RTMP_URL = 'rtmps://global-live.mux.com:443/app'

function pickPublicPlaybackId(data) {
  if (!data?.playback_ids?.length) return null
  const pub = data.playback_ids.find((p) => p.policy === 'public')
  return pub?.id ?? data.playback_ids[0]?.id ?? null
}

function readStoredDayState() {
  const session = loadTodaySession()
  if (!session) {
    return {
      playbackId: null,
      streamKey: null,
      raw: null,
      hasSavedSessionToday: false,
    }
  }
  return {
    playbackId: session.playbackId,
    streamKey: session.streamKey,
    raw: { id: session.liveStreamId },
    hasSavedSessionToday: true,
  }
}

function formatMuxCreatedAt(createdAt) {
  if (createdAt == null) return '—'
  const num = Number(createdAt)
  const ms = Number.isFinite(num) && num < 1e12 ? num * 1000 : Date.parse(String(createdAt))
  if (Number.isNaN(ms)) return String(createdAt)
  return new Date(ms).toLocaleString()
}

/** Mux: `active` = encoder connected / viewers can watch; `idle` = waiting; `disabled` = cannot publish */
function isMuxBroadcasting(stream) {
  return stream?.status === 'active'
}

function sortStreamsBroadcastingFirst(streams) {
  const rank = (s) => {
    if (s.status === 'active') return 0
    if (s.status === 'idle') return 1
    if (s.status === 'disabled') return 2
    return 3
  }
  return [...streams].sort((a, b) => rank(a) - rank(b))
}

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

export default function LiveStreamCreator() {
  const initial = readStoredDayState()
  const [playbackId, setPlaybackId] = useState(initial.playbackId)
  const [playerReloadNonce, setPlayerReloadNonce] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [streamKey, setStreamKey] = useState(initial.streamKey)
  const [raw, setRaw] = useState(initial.raw)
  const [hasSavedSessionToday, setHasSavedSessionToday] = useState(initial.hasSavedSessionToday)
  const [liveStreams, setLiveStreams] = useState([])
  /** `all` = every stream (broadcasting first); `active` = Mux API filter, only encoder-connected streams */
  const [listStatusFilter, setListStatusFilter] = useState(
    /** @type {'all' | 'active'} */ ('all'),
  )
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState(null)

  const todayStreamId = loadTodaySession()?.liveStreamId ?? null

  const refreshLiveStreamsList = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (listStatusFilter === 'active') params.set('status', 'active')
      const res = await fetch(`/api/mux/live-streams?${params}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          body?.error?.messages?.join?.('; ') ||
          body?.error ||
          body?.message ||
          res.statusText
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      }
      let rows = Array.isArray(body.data) ? body.data : []
      if (listStatusFilter === 'all') rows = sortStreamsBroadcastingFirst(rows)
      setLiveStreams(rows)
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e))
      setLiveStreams([])
    } finally {
      setListLoading(false)
    }
  }, [listStatusFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshLiveStreamsList()
    }, 0)
    return () => clearTimeout(timer)
  }, [refreshLiveStreamsList])

  function applyStreamRecord(data) {
    setRaw(data)
    const pid = pickPublicPlaybackId(data)
    if (pid) {
      setPlayerReloadNonce(0)
      setPlaybackId(pid)
    } else {
      setPlaybackId(null)
    }
    setStreamKey(data?.stream_key ?? null)
  }

  function resumeTodayFromStorage() {
    const session = loadTodaySession()
    if (!session) return
    setHasSavedSessionToday(true)
    setPlayerReloadNonce(0)
    setPlaybackId(session.playbackId)
    setStreamKey(session.streamKey)
    setRaw({ id: session.liveStreamId })
    setError(null)
  }

  async function ensureTodayLiveStream() {
    setLoading(true)
    setError(null)
    const existing = loadTodaySession()
    if (existing) {
      resumeTodayFromStorage()
      setLoading(false)
      await refreshLiveStreamsList()
      return
    }

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
      const pid = pickPublicPlaybackId(data)
      if (!data?.id || !pid) {
        throw new Error('Mux response missing live stream id or playback id')
      }
      saveTodaySession({
        liveStreamId: data.id,
        playbackId: pid,
        streamKey: data.stream_key ?? null,
      })
      setHasSavedSessionToday(true)
      applyStreamRecord(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
      await refreshLiveStreamsList()
    }
  }

  function retryPlayerConnection() {
    setPlayerReloadNonce((n) => n + 1)
  }

  function selectListStream(stream) {
    setError(null)
    applyStreamRecord(stream)
  }

  const dayLabel = getLocalDayKey()

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <aside className="w-full shrink-0 space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900 lg:w-80">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Live streams
          </h2>
          <button
            type="button"
            onClick={() => refreshLiveStreamsList()}
            disabled={listLoading}
            className="text-xs font-medium text-neutral-600 underline-offset-2 hover:underline disabled:opacity-50 dark:text-neutral-400"
          >
            {listLoading ? 'Loading…' : 'Refresh'}
          </button>
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
          encoder is connected; idle streams are not broadcasting yet.
        </p>
        {listError && (
          <p className="text-xs text-red-600 dark:text-red-400" role="alert">
            {listError}
          </p>
        )}
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
              const isSelected = raw?.id === s.id
              const broadcasting = isMuxBroadcasting(s)
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => selectListStream(s)}
                    className={`w-full rounded-md border px-2 py-2 text-left text-xs transition-colors ${
                      isSelected
                        ? 'border-neutral-800 bg-neutral-200 dark:border-neutral-300 dark:bg-neutral-800'
                        : broadcasting
                          ? 'border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100/80 dark:border-emerald-800 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40'
                          : 'border-transparent bg-white hover:bg-neutral-100 dark:bg-neutral-950 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StreamStatusBadge status={s.status} />
                      <span className="font-mono text-[11px] text-neutral-800 dark:text-neutral-200">
                        {s.id?.slice(0, 12)}…
                      </span>
                      {isTodaySaved && (
                        <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                          Today
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-neutral-500">
                      {formatMuxCreatedAt(s.created_at)}
                    </div>
                    {pid && (
                      <div className="mt-0.5 font-mono text-[10px] text-neutral-400">
                        playback {pid.slice(0, 10)}…
                      </div>
                    )}
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </aside>

      <div className="min-w-0 flex-1 space-y-6">
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
              {hasSavedSessionToday && todayStreamId && raw?.id !== todayStreamId && (
                <button
                  type="button"
                  onClick={resumeTodayFromStorage}
                  className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/40"
                >
                  Back to today&apos;s stream
                </button>
              )}
              <span className="text-xs">
                Retry remounts the player so it fetches the live manifest again.
              </span>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-700 dark:bg-neutral-900">
          <p className="font-medium text-neutral-800 dark:text-neutral-200">
            Today ({dayLabel}): one new Mux live stream per browser, per day. Later visits reuse the
            same RTMP details from this device — no extra creates until tomorrow.
          </p>
          {hasSavedSessionToday ? (
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              This browser already has a stream saved for today. Use{' '}
              <strong>Retry connection</strong> after you go live, or choose another stream in the
              list.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={ensureTodayLiveStream}
              disabled={loading}
              className="rounded bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {loading
                ? 'Working…'
                : hasSavedSessionToday
                  ? 'Reload today’s stream'
                  : 'Create today’s live stream'}
            </button>
          </div>
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
              Live stream id:{' '}
              <span className="font-mono text-neutral-700 dark:text-neutral-300">{raw.id}</span>
            </p>
          )}
          {playbackId && (
            <p className="text-xs text-neutral-500">
              Playback ID:{' '}
              <span className="font-mono text-neutral-700 dark:text-neutral-300">{playbackId}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
