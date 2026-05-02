/**
 * Steps for sending only the Lucy WebRTC output tile to OBS (Window Capture + crop).
 *
 * @param {object} props
 * @param {'embedded' | 'page'} [props.variant] — embedded = under the Lucy preview; page = intro strip
 */
export default function LucyObsCaptureHint({ variant = 'embedded' }) {
  const box =
    variant === 'embedded'
      ? 'mt-2 rounded-lg border border-fuchsia-300/90 bg-fuchsia-50/95 p-3 text-[11px] leading-snug text-fuchsia-950 dark:border-fuchsia-800 dark:bg-fuchsia-950/50 dark:text-fuchsia-100'
      : 'rounded-xl border border-fuchsia-200 bg-fuchsia-50/90 p-4 text-sm text-fuchsia-950 dark:border-fuchsia-900 dark:bg-fuchsia-950/40 dark:text-fuchsia-50'

  return (
    <div className={box}>
      <p className="font-semibold text-fuchsia-900 dark:text-fuchsia-100">
        {variant === 'embedded' ? 'OBS: capture this Lucy output' : 'OBS + Mux already set?'}
      </p>
      <p className="mt-1 text-fuchsia-900/90 dark:text-fuchsia-200/90">
        {variant === 'page'
          ? 'You only need to feed OBS the processed preview on the right — not the raw webcam tile.'
          : 'Use this framed preview as the only picture you send upstream (crop in OBS for exact sizing).'}
      </p>
      <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-fuchsia-900/95 dark:text-fuchsia-100/95">
        <li>
          Click <strong className="font-semibold">Start virtual try-on</strong> so the output above is live.
        </li>
        <li>
          In OBS → <strong className="font-semibold">Sources</strong> → <strong className="font-semibold">+</strong> →{' '}
          <strong className="font-semibold">Window Capture</strong> (macOS) → pick this browser window.
        </li>
        <li>
          Drag edges or use <strong className="font-semibold">Transform</strong> / <strong className="font-semibold">Filters → Crop</strong> so
          the canvas shows only the purple-outlined <strong className="font-semibold">Lucy output</strong> panel (not the camera column).
        </li>
        <li>
          Leave your existing <strong className="font-semibold">Stream</strong> settings as they are →{' '}
          <strong className="font-semibold">Start Streaming</strong>.
        </li>
      </ol>
    </div>
  )
}
