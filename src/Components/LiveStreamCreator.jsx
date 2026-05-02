import { useCallback, useEffect, useState } from 'react'
import MuxMediaPlayer from './MuxMediaPlayer'
import MuxLiveStreamsSidebar from './MuxLiveStreamsSidebar'
import MuxPastAssetsSidebar from './MuxPastAssetsSidebar'
import StreamPublisher from './StreamPublisher'
import FfmpegCompanionControls from './FfmpegCompanionControls'
import ObsMuxSetup from './ObsMuxSetup'
import {
  getLocalDayKey,
  loadTodaySession,
  saveTodaySession,
  subscribeMuxSessionChanged,
} from '../lib/muxDailySession'
import { pickPublicPlaybackId, sortStreamsBroadcastingFirst } from '../lib/muxStreams'

const MUX_RTMP_URL = 'rtmps://global-live.mux.com:443/app'

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

  useEffect(() => {
    return subscribeMuxSessionChanged(() => {
      const s = loadTodaySession()
      if (s) {
        setHasSavedSessionToday(true)
        setPlaybackId(s.playbackId)
        setStreamKey(s.streamKey)
        setRaw({ id: s.liveStreamId })
        setPlayerReloadNonce((n) => n + 1)
        setError(null)
      }
      void refreshLiveStreamsList()
    })
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

  async function createLiveStreamViaApi() {
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
    return data
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
      const data = await createLiveStreamViaApi()
      const pid = pickPublicPlaybackId(data)
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

  async function createNewLiveStream() {
    const ok = window.confirm(
      'Create a new Mux live stream? This adds another stream in your account. Your saved RTMP stream key for “today” will switch to this new stream so FFmpeg and the player stay in sync.',
    )
    if (!ok) return

    setLoading(true)
    setError(null)
    try {
      const data = await createLiveStreamViaApi()
      const pid = pickPublicPlaybackId(data)
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
      <MuxLiveStreamsSidebar
        liveStreams={liveStreams}
        listLoading={listLoading}
        listError={listError}
        listStatusFilter={listStatusFilter}
        setListStatusFilter={setListStatusFilter}
        onRefresh={refreshLiveStreamsList}
        onNewStream={createNewLiveStream}
        newStreamLoading={loading}
        todayStreamId={todayStreamId}
        selectedStreamId={raw?.id}
        onSelectStream={selectListStream}
      />

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
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100">Browser capture</h3>
          <p className="text-xs leading-snug text-neutral-600 dark:text-neutral-400">
            Choose camera or screen plus microphone for a local preview. Mux Live ingest is{' '}
            <strong className="font-medium text-neutral-800 dark:text-neutral-200">RTMP/SRT</strong>{' '}
            — the browser cannot publish that directly. Typical setups: OBS or Streamlabs with this
            feed as a source, or a server that accepts WebRTC and forwards RTMP to your stream key.
          </p>
          <StreamPublisher />
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
          <ObsMuxSetup rtmpUrl={MUX_RTMP_URL} streamKey={streamKey} showLucyCaptureSteps={false} />
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
          <FfmpegCompanionControls />
        </div>
      </div>

      <MuxPastAssetsSidebar />
    </div>
  )
}
