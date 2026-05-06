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
 * Parse pasted Mux playback ID or URLs into an HLS manifest URL for Overshoot bridging.
 * Supported: raw ID, `https://player.mux.com/{id}`, `https://stream.mux.com/{id}.m3u8` (with optional query).
 * @returns {{ playbackId: string | null, hlsUrl: string }}
 */
export function resolveMuxPlaybackSource(input) {
  const trimmed = typeof input === 'string' ? input.trim() : ''
  if (!trimmed) {
    return { playbackId: null, hlsUrl: '' }
  }

  try {
    const u = new URL(trimmed)
    const host = u.hostname.replace(/^www\./, '')

    if (host === 'player.mux.com') {
      const seg = u.pathname.split('/').filter(Boolean)[0]
      if (seg && /^[a-zA-Z0-9_-]+$/.test(seg)) {
        return { playbackId: seg, hlsUrl: buildMuxHlsUrl(seg) }
      }
    }

    if (host === 'stream.mux.com') {
      const m = u.pathname.match(/^\/([a-zA-Z0-9_-]+)\.m3u8$/i)
      if (m) {
        const id = m[1]
        return { playbackId: id, hlsUrl: `${u.origin}${u.pathname.split('?')[0]}` }
      }
    }
  } catch {
    //
  }

  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { playbackId: trimmed, hlsUrl: buildMuxHlsUrl(trimmed) }
  }

  return { playbackId: null, hlsUrl: '' }
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
