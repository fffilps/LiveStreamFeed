import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
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
    ],
  }
})
