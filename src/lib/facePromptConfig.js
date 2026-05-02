/**
 * Parses project `prompts.txt`: template line with `{style}` / `{thing}`, optional Flux model URL, example line.
 */
export function parseFacePrompts(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const templateLine = lines.find((l) => l.includes('{style}') && l.includes('{thing}'))
  const template = templateLine ?? '{style} styled {thing} face portrait'

  const modelLine = lines.find((l) => l.includes('fal.ai/models/'))
  let fluxEndpoint = 'fal-ai/flux/schnell'
  if (modelLine) {
    const m = modelLine.match(/fal\.ai\/models\/([^\s]+)/)
    if (m) {
      fluxEndpoint = m[1].replace(/\/$/, '')
    }
  }

  let defaultStyle = 'anime'
  let defaultThing = 'bird'
  const exampleLine = lines.find(
    (l) =>
      !l.includes('{') &&
      !l.startsWith('http') &&
      /styled/i.test(l) &&
      /face/i.test(l),
  )
  if (exampleLine) {
    const parts = exampleLine.match(/^(\S+)\s+styled\s+(\S+)\s+face/i)
    if (parts) {
      defaultStyle = parts[1]
      defaultThing = parts[2]
    }
  }

  return { template, fluxEndpoint, defaultStyle, defaultThing }
}

/** Three style presets (paired with “things” via template). */
export const STYLE_BUTTONS = [
  { id: 'anime', label: 'Anime' },
  { id: 'watercolor', label: 'Watercolor' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
]

/** Three “thing” presets (characters / motifs). */
export const THING_BUTTONS = [
  { id: 'bird', label: 'Bird' },
  { id: 'fox', label: 'Fox' },
  { id: 'robot', label: 'Robot' },
]

export function buildFacePrompt(template, style, thing) {
  let t = template.replace(/\{style\}/gi, style).replace(/\{thing\}/gi, thing)
  t = t.replace(/portriat/gi, 'portrait')
  return t
}
