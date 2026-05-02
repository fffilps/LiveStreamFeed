import { Link, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import MuxMediaPlayer from '../Components/MuxMediaPlayer'

export default function WatchLivePage() {
  const [params] = useSearchParams()
  const playbackId = params.get('playbackId')
  const [reloadNonce, setReloadNonce] = useState(0)

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/"
            className="text-sm font-medium text-violet-400 hover:text-violet-300 hover:underline"
          >
            ← Dashboard
          </Link>
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            disabled={!playbackId}
            className="rounded-md border border-neutral-600 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
          >
            Retry player
          </button>
        </div>

        {!playbackId ? (
          <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-8 text-center">
            <p className="text-neutral-300">Missing watch link.</p>
            <p className="mt-2 text-sm text-neutral-500">
              Open a share link that includes <code className="rounded bg-neutral-800 px-1">playbackId</code>, or ask the
              host for the viewer URL from the camera or dashboard page.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-800 shadow-lg">
            <MuxMediaPlayer playbackId={playbackId} reloadNonce={reloadNonce} />
          </div>
        )}
      </div>
    </div>
  )
}
