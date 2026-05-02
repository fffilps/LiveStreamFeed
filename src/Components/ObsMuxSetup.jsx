import { useCallback, useMemo, useState } from 'react'

const DEFAULT_RTMP = 'rtmps://global-live.mux.com:443/app'

/** Single-string RTMP publish destination (same format as FFmpeg’s output URL). */
function buildMuxRtmpPublishUrl(rtmpBase, streamKey) {
  if (!streamKey) return ''
  const base = rtmpBase.replace(/\/$/, '')
  return `${base}/${streamKey}`
}

async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text)
}

/**
 * Copy-paste helpers + OBS Studio steps for pushing to Mux Live (RTMPS).
 *
 * @param {object} props
 * @param {string} [props.rtmpUrl]
 * @param {string | null} [props.streamKey]
 * @param {boolean} [props.showLucyCaptureSteps] — Window Capture for Lucy output on /camera
 * @param {boolean} [props.collapseMuxIngest] — tuck RTMP URL UI behind &lt;details&gt; when Mux is already set in OBS
 */
export default function ObsMuxSetup({
  rtmpUrl = DEFAULT_RTMP,
  streamKey,
  showLucyCaptureSteps = false,
  collapseMuxIngest = false,
}) {
  const [copied, setCopied] = useState(
    /** @type {null | 'full' | 'server' | 'key' | 'guide'} */ (null),
  )

  const fullPublishUrl = useMemo(
    () => buildMuxRtmpPublishUrl(rtmpUrl, streamKey ?? ''),
    [rtmpUrl, streamKey],
  )

  const guideText = useMemo(() => {
    const lines = [
      'Mux Live + OBS Studio — quick setup',
      '',
      '1) Install OBS: https://obsproject.com/',
      '',
      '2) OBS → Settings → Stream → Service: Custom',
      '',
      '3) Paste ONE destination into OBS (fastest):',
      fullPublishUrl
        ? `   Server: ${fullPublishUrl}`
        : '   (create a live stream in this app first)',
      '   Stream key: leave EMPTY',
      '   If OBS will not connect, use Server + Stream key separately (copy buttons in the app).',
      '',
      '4) OBS → Settings → Output — Simple mode; hardware encoder if available.',
      '',
      '5) Sources — video:',
    ]
    if (showLucyCaptureSteps) {
      lines.push(
        '   Window Capture → browser window with Lucy output; crop to #lucy-output-video panel.',
      )
    } else {
      lines.push('   Video Capture Device, or Window Capture for a browser / app.')
    }
    lines.push(
      '',
      '6) Start Streaming. Dashboard → Retry player if needed.',
      '',
      'Security: full URL contains your stream key — treat it like a password.',
    )
    return lines.join('\n')
  }, [fullPublishUrl, showLucyCaptureSteps])

  const flashCopied = useCallback((kind) => {
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 2200)
  }, [])

  const onCopyFull = useCallback(async () => {
    if (!fullPublishUrl) return
    try {
      await copyToClipboard(fullPublishUrl)
      flashCopied('full')
    } catch {
      //
    }
  }, [flashCopied, fullPublishUrl])

  const onCopyServer = useCallback(async () => {
    try {
      await copyToClipboard(rtmpUrl)
      flashCopied('server')
    } catch {
      //
    }
  }, [flashCopied, rtmpUrl])

  const onCopyKey = useCallback(async () => {
    if (!streamKey) return
    try {
      await copyToClipboard(streamKey)
      flashCopied('key')
    } catch {
      //
    }
  }, [flashCopied, streamKey])

  const onCopyGuide = useCallback(async () => {
    try {
      await copyToClipboard(guideText)
      flashCopied('guide')
    } catch {
      //
    }
  }, [flashCopied, guideText])

  if (!streamKey) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50/80 p-4 text-xs text-neutral-600 dark:border-neutral-600 dark:bg-neutral-900/40 dark:text-neutral-400">
        <p className="font-medium text-neutral-800 dark:text-neutral-200">OBS → Mux</p>
        <p className="mt-1">
          Create today’s live stream above to show the one-line RTMP URL and copy buttons.
        </p>
      </div>
    )
  }

  const ingestDetails = (
    <>
      <div>
        <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">OBS → Mux (one URL)</h3>
        <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
          Copy this full RTMP destination — same string FFmpeg uses. Official OBS:{' '}
          <a
            href="https://obsproject.com/"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-sky-800 underline dark:text-sky-400"
          >
            obsproject.com
          </a>
        </p>
      </div>

      <div className="rounded-lg border-2 border-sky-400/80 bg-white p-3 shadow-sm dark:border-sky-600 dark:bg-neutral-950">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-300">
          Paste into OBS → Settings → Stream → Server
        </p>
        <p className="mt-2 break-all font-mono text-[11px] leading-snug text-neutral-900 dark:text-neutral-100">
          {fullPublishUrl}
        </p>
        <button
          type="button"
          onClick={() => void onCopyFull()}
          className="mt-3 w-full rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-500"
        >
          {copied === 'full' ? 'Copied full RTMP URL' : 'Copy full RTMP URL'}
        </button>
        <p className="mt-2 text-[11px] leading-snug text-neutral-600 dark:text-neutral-400">
          Set <strong className="font-medium text-neutral-800 dark:text-neutral-200">Service</strong> to{' '}
          <strong className="font-medium text-neutral-800 dark:text-neutral-200">Custom</strong>. Paste the URL above
          into <strong className="font-medium text-neutral-800 dark:text-neutral-200">Server</strong> and leave{' '}
          <strong className="font-medium text-neutral-800 dark:text-neutral-200">Stream key</strong> blank. That keeps
          sizing/scene work in OBS without juggling two fields. If your OBS build refuses to connect, use the split
          copies below (Server = base URL, Stream key = secret only).
        </p>
      </div>

      <details className="rounded border border-sky-200/90 bg-white/60 text-xs dark:border-sky-800 dark:bg-neutral-950/60">
        <summary className="cursor-pointer px-3 py-2 font-medium text-neutral-800 dark:text-neutral-200">
          Split server + stream key (fallback)
        </summary>
        <div className="space-y-3 border-t border-sky-100 px-3 pb-3 pt-2 dark:border-sky-900">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onCopyServer()}
              className="rounded-md bg-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600"
            >
              {copied === 'server' ? 'Copied server' : 'Copy server only'}
            </button>
            <button
              type="button"
              onClick={() => void onCopyKey()}
              className="rounded-md bg-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600"
            >
              {copied === 'key' ? 'Copied stream key' : 'Copy stream key only'}
            </button>
          </div>
          <div className="grid gap-2 font-mono text-[11px] text-neutral-800 dark:text-neutral-200 sm:grid-cols-2">
            <div className="rounded border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-900">
              <span className="text-neutral-500 dark:text-neutral-400">Server</span>
              <p className="mt-1 break-all">{rtmpUrl}</p>
            </div>
            <div className="rounded border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-900">
              <span className="text-neutral-500 dark:text-neutral-400">Stream key</span>
              <p className="mt-1 break-all">{streamKey}</p>
            </div>
          </div>
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onCopyGuide()}
          className="rounded-md border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-950 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100 dark:hover:bg-sky-900"
        >
          {copied === 'guide' ? 'Copied full guide' : 'Copy full setup guide'}
        </button>
      </div>
    </>
  )

  return (
    <div className="space-y-4 rounded-lg border border-sky-200 bg-sky-50/90 p-4 text-sm dark:border-sky-900 dark:bg-sky-950/35">
      {collapseMuxIngest && showLucyCaptureSteps ? (
        <p className="rounded-md border border-fuchsia-200 bg-fuchsia-50/90 px-3 py-2 text-xs leading-snug text-fuchsia-950 dark:border-fuchsia-900 dark:bg-fuchsia-950/40 dark:text-fuchsia-100">
          <strong className="font-semibold">Mux ingest already in OBS?</strong> Expand{' '}
          <strong className="font-semibold">Mux RTMP URL</strong> below only if you need to copy the destination again.
          Your scene sizing comes from Window Capture + crop on the{' '}
          <strong className="font-semibold">Lucy output</strong> panel (purple outline above).
        </p>
      ) : null}

      {collapseMuxIngest ? (
        <details className="rounded-lg border border-sky-300/80 bg-white/40 open:bg-white/60 dark:border-sky-800 dark:bg-neutral-950/40">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-sky-900 dark:text-sky-200">
            Mux RTMP URL & copy buttons
          </summary>
          <div className="space-y-4 border-t border-sky-100 px-3 pb-4 pt-3 dark:border-sky-900">
            {ingestDetails}
          </div>
        </details>
      ) : (
        ingestDetails
      )}

      <ol className="list-decimal space-y-1.5 pl-5 text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-300">
        <li>OBS main window → your scene → sources control sizing (transform/crop) for Lucy window capture.</li>
        <li>
          <strong className="font-medium text-neutral-900 dark:text-neutral-100">Start Streaming</strong> when ready.
        </li>
      </ol>

      {showLucyCaptureSteps ? (
        <p className="text-[11px] leading-snug text-neutral-600 dark:text-neutral-400">
          Lucy tile: crop Window Capture to the <strong className="text-neutral-700 dark:text-neutral-300">Lucy output</strong>{' '}
          panel (<code className="rounded bg-white px-1 dark:bg-neutral-900">#lucy-output-video</code>).
        </p>
      ) : null}
    </div>
  )
}
