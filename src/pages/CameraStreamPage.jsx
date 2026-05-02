import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import FfmpegCompanionControls from '../Components/FfmpegCompanionControls'
import LucyVtonRealtime from '../Components/LucyVtonRealtime'
import MuxLiveStreamsSidebar from '../Components/MuxLiveStreamsSidebar'
import MuxMediaPlayer from '../Components/MuxMediaPlayer'
import ObsMuxSetup from '../Components/ObsMuxSetup'
import { loadTodaySession, saveTodaySession, subscribeMuxSessionChanged } from '../lib/muxDailySession'
import { pickPublicPlaybackId, sortStreamsBroadcastingFirst } from '../lib/muxStreams'

const MUX_RTMP_URL = 'rtmps://global-live.mux.com:443/app'

/** Minimal shape for UI when hydrating from `saveTodaySession`. */
function streamRecordFromStoredSession(s) {
  return {
    id: s.liveStreamId,
    stream_key: s.streamKey,
    playback_ids: [{ id: s.playbackId, policy: 'public' }],
  }
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
  return body.data
}

export default function CameraStreamPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [streamRecord, setStreamRecord] = useState(() => {
    const existing = loadTodaySession()
    return existing ? streamRecordFromStoredSession(existing) : null
  })
  const [playerReloadNonce, setPlayerReloadNonce] = useState(0)

  const [liveStreams, setLiveStreams] = useState([])
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
    const t = setTimeout(() => void refreshLiveStreamsList(), 0)
    return () => clearTimeout(t)
  }, [refreshLiveStreamsList])

  useEffect(() => {
    return subscribeMuxSessionChanged(() => {
      const s = loadTodaySession()
      if (s) {
        setStreamRecord(streamRecordFromStoredSession(s))
        setPlayerReloadNonce((n) => n + 1)
        setError(null)
      }
      void refreshLiveStreamsList()
    })
  }, [refreshLiveStreamsList])

  function selectListStream(stream) {
    setError(null)
    setStreamRecord(stream)
    setPlayerReloadNonce(0)
  }

  async function ensureTodayLiveStream() {
    setLoading(true)
    setError(null)
    try {
      const existing = loadTodaySession()
      if (existing) {
        setStreamRecord(streamRecordFromStoredSession(existing))
        setPlayerReloadNonce((n) => n + 1)
        await refreshLiveStreamsList()
        return
      }

      const data = await createLiveStreamViaApi()
      const pid = pickPublicPlaybackId(data)
      if (!data?.id || !pid) {
        throw new Error('Mux response missing live stream id or playback id')
      }
      saveTodaySession({
        liveStreamId: data.id,
        playbackId: pid,
        streamKey: data.stream_key ?? null,
      })
      setStreamRecord(data)
      setPlayerReloadNonce(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
      await refreshLiveStreamsList()
    }
  }

  async function createNewLiveStream() {
    const ok = window.confirm(
      'Create a new Mux live stream? Your saved “today” RTMP key will switch to this stream — same behavior as on the dashboard.',
    )
    if (!ok) return

    setLoading(true)
    setError(null)
    try {
      const data = await createLiveStreamViaApi()
      const pid = pickPublicPlaybackId(data)
      if (!data?.id || !pid) {
        throw new Error('Mux response missing live stream id or playback id')
      }
      saveTodaySession({
        liveStreamId: data.id,
        playbackId: pid,
        streamKey: data.stream_key ?? null,
      })
      setStreamRecord(data)
      setPlayerReloadNonce(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
      await refreshLiveStreamsList()
    }
  }

  const playbackId = streamRecord ? pickPublicPlaybackId(streamRecord) : null
  const hasTodaySession = Boolean(loadTodaySession())

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-10">
      <Link
        to="/"
        className="inline-block text-sm font-medium text-violet-700 hover:underline dark:text-violet-400"
      >
        ← Back to dashboard
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          Camera & create stream
        </h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Same Mux “today” session as the{' '}
          <Link to="/" className="font-medium text-violet-700 underline dark:text-violet-400">
            dashboard
          </Link>
          : pick a stream in the list (same controls as the dashboard). Use{' '}
          <strong className="font-medium text-neutral-800 dark:text-neutral-200">Share link</strong> on{' '}
          <strong className="font-medium text-emerald-800 dark:text-emerald-300">Live</strong> streams for the viewer
          page. With OBS → Mux configured, use{' '}
          <strong className="font-medium text-neutral-800 dark:text-neutral-200">Window Capture</strong> on the{' '}
          <strong className="font-medium text-neutral-800 dark:text-neutral-200">Lucy output</strong> panel (purple
          frame).
        </p>
      </div>

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
          selectedStreamId={streamRecord?.id}
          onSelectStream={selectListStream}
        />

        <div className="min-w-0 flex-1 space-y-8">
          <section className="space-y-4 rounded-xl border border-fuchsia-200 bg-gradient-to-b from-fuchsia-50/80 to-neutral-50 p-5 dark:border-fuchsia-900 dark:from-fuchsia-950/40 dark:to-neutral-900">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Lucy 2 head swap (fal realtime)
            </h2>
            <LucyVtonRealtime />
          </section>

          <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-950">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Mux live stream (same flow as dashboard)
            </h2>
            <p className="text-xs leading-snug text-neutral-600 dark:text-neutral-400">
              Creating or reloading uses{' '}
              <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">saveTodaySession</code> — the dashboard
              updates automatically if it is open in another tab.
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void ensureTodayLiveStream()}
                disabled={loading}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {loading
                  ? 'Working…'
                  : hasTodaySession
                    ? 'Reload today’s stream'
                    : 'Create today’s live stream'}
              </button>
              <button
                type="button"
                onClick={() => void createNewLiveStream()}
                disabled={loading}
                className="rounded-lg border border-neutral-400 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                New stream (replace today)
              </button>
              <button
                type="button"
                onClick={() => setPlayerReloadNonce((n) => n + 1)}
                disabled={!playbackId}
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                Retry player
              </button>
            </div>

            {error ? (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            ) : null}

            <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
              <MuxMediaPlayer playbackId={playbackId} reloadNonce={playerReloadNonce} />
            </div>

            {streamRecord ? (
              <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 font-mono text-xs text-neutral-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200">
                <p>
                  <span className="text-neutral-500">Live stream id</span>
                  <br />
                  {streamRecord.id}
                </p>
                {playbackId ? (
                  <p>
                    <span className="text-neutral-500">Playback ID</span>
                    <br />
                    {playbackId}
                  </p>
                ) : null}
                {streamRecord.stream_key ? (
                  <>
                    <p>
                      <span className="text-neutral-500">RTMP URL</span>
                      <br />
                      {MUX_RTMP_URL}
                    </p>
                    <p>
                      <span className="text-neutral-500">Stream key</span> (secret)
                      <br />
                      {streamRecord.stream_key}
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}

            <ObsMuxSetup
              rtmpUrl={MUX_RTMP_URL}
              streamKey={streamRecord?.stream_key ?? null}
              showLucyCaptureSteps
              collapseMuxIngest
            />

            <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-4 text-xs leading-snug text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <p className="font-medium text-amber-950 dark:text-amber-50">FFmpeg companion = Mac camera only</p>
              <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
                <strong className="font-semibold">Lucy</strong> lives in the browser; the companion stream is{' '}
                <strong className="font-semibold">not</strong> that preview. For Lucy on Mux, keep using OBS Window
                Capture on the purple <strong className="font-semibold">Lucy output</strong> tile with your existing
                RTMP settings.
              </p>
            </div>

            <FfmpegCompanionControls />
          </section>
        </div>
      </div>
    </div>
  )
}
