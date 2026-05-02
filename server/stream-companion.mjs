/**
 * Local-only HTTP API to start/stop FFmpeg (macOS → Mux RTMP).
 * The browser cannot run shell commands; you run this process, then use the in-app buttons.
 *
 *   npm run stream:companion
 *
 * Binds 127.0.0.1 only. Configure CORS for your Vite origin via Vite dev server (same machine).
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PORT = Number(process.env.STREAM_COMPANION_PORT) || 54781

function loadLocalEnv() {
  const p = join(ROOT, 'local.env')
  if (!existsSync(p)) return {}
  const out = {}
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

/** @type {import('node:child_process').ChildProcessWithoutNullStreams | null} */
let ffmpeg = null

function corsHeaders(req) {
  const origin = req.headers.origin
  const allowed =
    origin &&
    (/^https?:\/\/localhost(?::\d+)?$/.test(origin) ||
      /^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin))
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function sendJson(res, status, body, req) {
  const h = corsHeaders(req)
  res.writeHead(status, {
    ...h,
    'Content-Type': 'application/json',
  })
  res.end(JSON.stringify(body))
}

function startFfmpeg(fileEnv) {
  if (ffmpeg) return { ok: false, error: 'already_running' }

  const streamKey = fileEnv.MUX_STREAM_KEY || process.env.MUX_STREAM_KEY
  if (!streamKey) {
    return { ok: false, error: 'missing_MUX_STREAM_KEY_in_local_env' }
  }

  if (process.platform !== 'darwin') {
    return { ok: false, error: 'macos_only_avfoundation' }
  }

  const rtmpBase = fileEnv.MUX_RTMP_URL || process.env.MUX_RTMP_URL || 'rtmps://global-live.mux.com:443/app'
  const videoIdx = fileEnv.MUX_AVFOUNDATION_VIDEO ?? process.env.MUX_AVFOUNDATION_VIDEO ?? '0'
  const audioIdx = fileEnv.MUX_AVFOUNDATION_AUDIO ?? process.env.MUX_AVFOUNDATION_AUDIO ?? '0'
  const framerate = fileEnv.MUX_FRAMERATE ?? process.env.MUX_FRAMERATE ?? '60'

  const target = `${rtmpBase.replace(/\/$/, '')}/${streamKey}`

  const args = [
    '-f',
    'avfoundation',
    '-framerate',
    String(framerate),
    '-pixel_format',
    'uyvy422',
    '-i',
    `${videoIdx}:${audioIdx}`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-f',
    'flv',
    target,
  ]

  try {
    ffmpeg = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    })
  } catch (err) {
    ffmpeg = null
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  ffmpeg.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk)
  })

  ffmpeg.on('exit', (code) => {
    console.error(`[stream-companion] ffmpeg exited ${code}`)
    ffmpeg = null
  })

  ffmpeg.on('error', (err) => {
    console.error('[stream-companion] ffmpeg spawn error:', err.message)
    ffmpeg = null
  })

  return { ok: true, pid: ffmpeg.pid }
}

function stopFfmpeg() {
  if (!ffmpeg || !ffmpeg.pid) return { ok: false, error: 'not_running' }
  try {
    ffmpeg.kill('SIGTERM')
  } catch {
    //
  }
  ffmpeg = null
  return { ok: true }
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req))
    res.end()
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/stream/status') {
    sendJson(
      res,
      200,
      {
        running: Boolean(ffmpeg?.pid),
        pid: ffmpeg?.pid ?? null,
      },
      req,
    )
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/stream/start') {
    const env = { ...loadLocalEnv(), ...process.env }
    const result = startFfmpeg(env)
    if (!result.ok) {
      const status = result.error === 'already_running' ? 409 : 400
      sendJson(res, status, result, req)
      return
    }
    sendJson(res, 200, result, req)
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/stream/stop') {
    const result = stopFfmpeg()
    sendJson(res, result.ok ? 200 : 400, result, req)
    return
  }

  sendJson(res, 404, { error: 'not_found' }, req)
})

server.listen(PORT, '127.0.0.1', () => {
  console.error(`[stream-companion] http://127.0.0.1:${PORT} (FFmpeg macOS → Mux)`)
})
