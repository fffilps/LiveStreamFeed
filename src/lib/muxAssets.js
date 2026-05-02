import { pickPublicPlaybackId } from './muxStreams'

export function pickAssetPlaybackId(asset) {
  return pickPublicPlaybackId(asset)
}

/** Live RTMP/SRT recordings (and similar) vs uploads / direct ingest. */
export function isLikelyLiveRecording(asset) {
  const t = asset?.ingest_type
  if (typeof t === 'string' && t.toLowerCase().includes('live')) return true
  if (asset?.live_stream_id) return true
  return false
}

export function formatAssetDurationSeconds(sec) {
  if (sec == null || !Number.isFinite(Number(sec))) return '—'
  const n = Math.floor(Number(sec))
  const s = n % 60
  const m = Math.floor(n / 60) % 60
  const h = Math.floor(n / 3600)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function sortAssetsNewestFirst(assets) {
  return [...assets].sort((a, b) => {
    const ta = Number(a?.created_at) || 0
    const tb = Number(b?.created_at) || 0
    return tb - ta
  })
}
