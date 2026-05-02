const STORAGE_KEY = 'liveFeed:muxDailyLiveStream'

export function getLocalDayKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** @returns {{ dayKey: string, liveStreamId: string, playbackId: string, streamKey: string | null } | null} */
export function loadTodaySession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data.dayKey !== getLocalDayKey()) return null
    if (!data.liveStreamId || !data.playbackId) return null
    return data
  } catch {
    return null
  }
}

export function saveTodaySession({ liveStreamId, playbackId, streamKey }) {
  const payload = {
    dayKey: getLocalDayKey(),
    liveStreamId,
    playbackId,
    streamKey: streamKey ?? null,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}
