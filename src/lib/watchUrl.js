/**
 * Mux-hosted player — works from any phone/browser worldwide with a **public** playback ID (no deploy needed).
 * @see https://docs.mux.com/guides/play-your-videos
 */
export function buildMuxHostedPlayerUrl(playbackId) {
  if (!playbackId) return ''
  return `https://player.mux.com/${encodeURIComponent(playbackId)}`
}

/** Direct HLS manifest (public playback policy). */
export function buildMuxHlsUrl(playbackId) {
  if (!playbackId) return ''
  return `https://stream.mux.com/${encodeURIComponent(playbackId)}.m3u8`
}

/**
 * PNG QR via api.qrserver.com — stable img URL for long watch links (no client-side QR library).
 */
export function buildQrServerImageUrl(text, sizePx = 220) {
  if (!text) return ''
  const params = new URLSearchParams({
    size: `${sizePx}x${sizePx}`,
    data: text,
  })
  return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`
}

/**
 * Same-origin viewer route in this app — requires your site to be deployed at that host for shared links.
 */
export function buildWatchPageUrl(playbackId) {
  if (!playbackId) return ''
  const qs = new URLSearchParams({ playbackId })
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/watch?${qs}`
  }
  return `/watch?${qs}`
}
