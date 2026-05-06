# liveFeed

React + Vite app for **Mux live streaming**, **Lucy VTON (fal.ai)**, and **Overshoot** vision/chat demos. The dev server can proxy Mux and Overshoot API calls so secrets stay in `local.env` instead of the browser bundle.

---

## Requirements

- **Node.js** 18+ (for `npm run dev` / `npm run build`)
- **Optional:** **FFmpeg** on macOS if you use `npm run stream:camera` to publish your webcam to Mux

---

## Quick start

1. **Clone and install**

   ```bash
   git clone <your-fork-or-repo-url> liveFeed
   cd liveFeed
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example local.env
   ```

   Edit **`local.env`** and add your own keys (see [Environment variables](#environment-variables) below).  
   `local.env` is **gitignored** — do not commit it.

3. **Run the app**

   ```bash
   npm run dev
   ```

   Open the URL Vite prints (usually `http://localhost:5173`).

4. **Lint / build** (optional)

   ```bash
   npm run lint
   npm run build
   ```

---

## Environment variables

All values below go in **`local.env`** unless noted. The template in [`.env.example`](.env.example) mirrors the same keys.

| Variable | Used for | Where to get it |
|----------|----------|-----------------|
| **`MUX_TOKEN_ID`** / **`MUX_TOKEN_SECRET`** | Listing/creating live streams, assets, dev API proxy to Mux | [Mux Dashboard → Access Tokens](https://dashboard.mux.com/settings/access-tokens) |
| **`OVERSHOOT_API_KEY`** | Overshoot streams, keepalive, chat completions (via dev proxy) | [Overshoot](https://overshoot.ai) → API keys (`ovs_...`). **Do not** use a `VITE_` prefix. |
| **`MUX_STREAM_KEY`** | Optional convenience for **`npm run stream:camera`** | Create a live stream in the app, then copy the **stream key** from the dashboard UI into `local.env`. |
| **`VITE_FAL_KEY`** | Lucy VTON realtime on **`/camera`** | [fal.ai Dashboard](https://fal.ai/dashboard) — API key. Can also live in `.env` / `.env.local`. |

**Production note:** `vite.config.js` only proxies Mux/Overshoot while **`npm run dev`** runs. For a deployed site, put the same forwards on your backend so **`OVERSHOOT_API_KEY`** and **Mux Basic auth** never ship to the browser.

---

## App pages

| Route | Nav label | What it does |
|-------|-----------|--------------|
| **`/`** | Dashboard | **Mux live stream** workflow: sidebar of streams, create/resume “today’s” stream, RTMP details, browser capture preview (WebRTC preview only — Mux ingest is RTMP/SRT), FFmpeg helper copy. **Past recordings** sidebar lists Mux VOD assets; open one for playback and optional **Mux Robots “find key moments”** job. |
| **`/camera`** | Camera & stream | **Lucy VTON** (fal.ai) realtime try-on plus Mux live stream sidebar (same list/controls as dashboard). For local styles, reference images under `public/reference-images/`. |
| **`/overshoot`** | Overshoot | **Overshoot.ai** demo: create a stream, publish **camera/mic** or **Mux HLS** (public playback ID / URL → `stream.mux.com/...m3u8` → `captureStream` into LiveKit), keepalive, then **chat completions** on the latest frame (`ovs://...`). |
| **`/watch`** | *(no nav link; shareable URL)* | Minimal **Mux player** page: `?playbackId=` query param for embed-style viewing (e.g. shared links / QR). |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server + middleware (Mux / Overshoot proxies, optional reference-image save). |
| `npm run build` | Production build to `dist/`. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | ESLint. |
| `npm run stream:camera` | macOS: FFmpeg publishes **camera + mic** to Mux using **`MUX_STREAM_KEY`** (and optional `MUX_AVFOUNDATION_*` — see script / terminal help). |

For `stream:camera`, list AVFoundation devices if needed:

```bash
ffmpeg -f avfoundation -list_devices true -i ""
```

Example:

```bash
export MUX_AVFOUNDATION_VIDEO=0
export MUX_AVFOUNDATION_AUDIO=1
npm run stream:camera
```

Then in the app use **Retry connection** or open **`/watch?playbackId=...`** once Mux shows the stream as active.

---

## Tech stack

- **React** + **React Router** + **Vite**
- **Tailwind CSS** v4
- **@mux/mux-player-react** for Mux playback
- **livekit-client** + **hls.js** on **`/overshoot`** (Mux HLS bridge)
- **@fal-ai/client** for Lucy on **`/camera`**

---

## License / security

- Treat **Mux stream keys**, **Mux tokens**, **Overshoot API keys**, and **fal keys** as secrets.
- This README and **`.env.example`** use placeholders only — never commit real credentials.
