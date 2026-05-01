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
          server.middlewares.use('/api/mux/live-streams', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.setHeader('Allow', 'POST')
              res.end()
              return
            }

            const id = muxEnv.MUX_TOKEN_ID
            const secret = muxEnv.MUX_TOKEN_SECRET
            if (!id || !secret) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  error:
                    'Missing MUX_TOKEN_ID or MUX_TOKEN_SECRET (set in .env.local or local.env).',
                }),
              )
              return
            }

            const auth = Buffer.from(`${id}:${secret}`, 'utf8').toString('base64')
            try {
              const muxRes = await fetch('https://api.mux.com/video/v1/live-streams', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Basic ${auth}`,
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
            } catch (e) {
              res.statusCode = 502
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  error: 'Mux request failed',
                  message: e instanceof Error ? e.message : String(e),
                }),
              )
            }
          })
        },
      },
    ],
  }
})
