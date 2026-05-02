import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Load key=value pairs from optional `local.env` (not bundled; dev server only). */
function loadOptionalLocalEnv(filename) {
  const filePath = resolve(process.cwd(), filename)
  if (!existsSync(filePath)) return {}
  const out = {}
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '')
  const localEnv = loadOptionalLocalEnv('local.env')
  const muxEnv = { ...fileEnv, ...localEnv }

  return {
    /** Expose `VITE_FAL_KEY` from `local.env` / `.env` to the client (fal Lucy realtime). */
    define: {
      'import.meta.env.VITE_FAL_KEY': JSON.stringify(muxEnv.VITE_FAL_KEY ?? ''),
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'mux-live-streams-proxy',
        configureServer(server) {
          const muxBase = 'https://api.mux.com/video/v1/live-streams'
          const apiPrefix = '/api/mux/live-streams'

          function muxAuthHeader() {
            const id = muxEnv.MUX_TOKEN_ID
            const secret = muxEnv.MUX_TOKEN_SECRET
            if (!id || !secret) return null
            return `Basic ${Buffer.from(`${id}:${secret}`, 'utf8').toString('base64')}`
          }

          function sendJson(res, status, body) {
            res.statusCode = status
            res.setHeader('Content-Type', 'application/json')
            res.end(typeof body === 'string' ? body : JSON.stringify(body))
          }

          server.middlewares.use(async (req, res, next) => {
            const url = new URL(req.url || '/', 'http://vite.local')
            if (!url.pathname.startsWith(apiPrefix)) {
              next()
              return
            }

            const auth = muxAuthHeader()
            if (!auth) {
              sendJson(res, 500, {
                error:
                  'Missing MUX_TOKEN_ID or MUX_TOKEN_SECRET (set in .env.local or local.env).',
              })
              return
            }

            const restPath = url.pathname.slice(apiPrefix.length)
            const isCollection = restPath === '' || restPath === '/'
            const idFromPath =
              !isCollection && restPath.startsWith('/')
                ? decodeURIComponent(restPath.slice(1).split('/')[0])
                : null

            try {
              if (req.method === 'POST' && isCollection) {
                const muxRes = await fetch(muxBase, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: auth,
                  },
                  body: JSON.stringify({
                    playback_policies: ['public'],
                    new_asset_settings: { playback_policies: ['public'] },
                  }),
                })
                const text = await muxRes.text()
                res.statusCode = muxRes.status
                res.setHeader('Content-Type', 'application/json')
                res.end(text)
                return
              }

              if (req.method === 'GET' && isCollection) {
                const muxRes = await fetch(muxBase + url.search, {
                  headers: { Authorization: auth },
                })
                const text = await muxRes.text()
                res.statusCode = muxRes.status
                res.setHeader('Content-Type', 'application/json')
                res.end(text)
                return
              }

              if (req.method === 'GET' && idFromPath) {
                const muxRes = await fetch(`${muxBase}/${encodeURIComponent(idFromPath)}`, {
                  headers: { Authorization: auth },
                })
                const text = await muxRes.text()
                res.statusCode = muxRes.status
                res.setHeader('Content-Type', 'application/json')
                res.end(text)
                return
              }

              res.statusCode = 405
              res.setHeader('Allow', 'GET, POST')
              res.end()
            } catch (e) {
              sendJson(res, 502, {
                error: 'Mux request failed',
                message: e instanceof Error ? e.message : String(e),
              })
            }
          })
        },
      },
      {
        name: 'reference-images-save',
        configureServer(server) {
          const SAVE_PREFIX = '/api/reference-images/save'
          const MAX_BYTES = 12 * 1024 * 1024

          function sendJson(res, status, body) {
            res.statusCode = status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(body))
          }

          function readJsonBody(req) {
            return new Promise((resolvePromise, reject) => {
              const chunks = []
              req.on('data', (c) => chunks.push(c))
              req.on('end', () => {
                try {
                  const raw = Buffer.concat(chunks).toString('utf8')
                  resolvePromise(raw ? JSON.parse(raw) : {})
                } catch (e) {
                  reject(e)
                }
              })
              req.on('error', reject)
            })
          }

          server.middlewares.use(async (req, res, next) => {
            const url = new URL(req.url || '/', 'http://vite.local')
            if (!url.pathname.startsWith(SAVE_PREFIX)) {
              next()
              return
            }

            if (req.method === 'OPTIONS') {
              res.statusCode = 204
              res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
              res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
              res.end()
              return
            }

            if (req.method !== 'POST') {
              res.statusCode = 405
              res.end()
              return
            }

            try {
              const body = await readJsonBody(req)
              const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''
              const label =
                typeof body.label === 'string' && body.label.trim()
                  ? body.label.trim()
                  : ''

              if (!imageUrl) {
                sendJson(res, 400, { error: 'imageUrl required' })
                return
              }

              let parsed
              try {
                parsed = new URL(imageUrl)
              } catch {
                sendJson(res, 400, { error: 'invalid imageUrl' })
                return
              }

              if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
                sendJson(res, 400, { error: 'only http(s) URLs allowed' })
                return
              }

              const imgRes = await fetch(imageUrl)
              if (!imgRes.ok) {
                sendJson(res, 502, { error: `failed to fetch image: ${imgRes.status}` })
                return
              }

              const buf = Buffer.from(await imgRes.arrayBuffer())
              if (buf.length > MAX_BYTES) {
                sendJson(res, 400, { error: 'image too large' })
                return
              }

              const ct = imgRes.headers.get('content-type') || ''
              const ext = ct.includes('png')
                ? 'png'
                : ct.includes('jpeg') || ct.includes('jpg')
                  ? 'jpg'
                  : 'png'

              const refDir = join(process.cwd(), 'public', 'reference-images')
              mkdirSync(refDir, { recursive: true })

              const id = `gen-${Date.now()}`
              const fileName = `${id}.${ext}`
              const filePath = join(refDir, fileName)

              writeFileSync(filePath, buf)

              const manifestPath = join(refDir, 'manifest.json')
              let manifest = { images: [] }
              if (existsSync(manifestPath)) {
                try {
                  manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
                } catch {
                  manifest = { images: [] }
                }
              }
              if (!Array.isArray(manifest.images)) manifest.images = []

              const entry = {
                id,
                label: label || `Styleface · generated ${new Date().toLocaleString()}`,
                file: fileName,
                /** Original remote URL so fal Lucy can fetch the image (localhost files fail). */
                sourceUrl: imageUrl,
              }
              manifest.images.push(entry)

              writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

              sendJson(res, 200, { ok: true, entry })
            } catch (e) {
              sendJson(res, 500, {
                error: e instanceof Error ? e.message : String(e),
              })
            }
          })
        },
      },
    ],
  }
})
