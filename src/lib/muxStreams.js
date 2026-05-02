/** Mux: `active` = encoder connected / viewers can watch; `idle` = waiting; `disabled` = cannot publish */
export function isMuxBroadcasting(stream) {
  return stream?.status === 'active'
}

export function sortStreamsBroadcastingFirst(streams) {
  const rank = (s) => {
    if (s.status === 'active') return 0
    if (s.status === 'idle') return 1
    if (s.status === 'disabled') return 2
    return 3
  }
  return [...streams].sort((a, b) => rank(a) - rank(b))
}

export function pickPublicPlaybackId(data) {
  if (!data?.playback_ids?.length) return null
  const pub = data.playback_ids.find((p) => p.policy === 'public')
  return pub?.id ?? data.playback_ids[0]?.id ?? null
}

export function formatMuxCreatedAt(createdAt) {
  if (createdAt == null) return '—'
  const num = Number(createdAt)
  const ms = Number.isFinite(num) && num < 1e12 ? num * 1000 : Date.parse(String(createdAt))
  if (Number.isNaN(ms)) return String(createdAt)
  return new Date(ms).toLocaleString()
}
