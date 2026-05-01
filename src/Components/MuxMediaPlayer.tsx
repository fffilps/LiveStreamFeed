import React from 'react'
import MuxPlayer from "@mux/mux-player-react";

type MuxMediaPlayerProps = {
  playbackId: string | null
  /** Bump to force a full player remount and reload the manifest (e.g. live not ready yet). */
  reloadNonce?: number
}

const MuxMediaPlayer = ({ playbackId, reloadNonce = 0 }: MuxMediaPlayerProps) => {
  if (!playbackId) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-100 text-sm text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        Create a live stream below — the player will use that playback ID once Mux returns it.
      </div>
    )
  }

  return (
    <div>
      <MuxPlayer
        key={`${playbackId}-${reloadNonce}`}
        playbackId={playbackId}
        streamType="live"
        metadata={{
          video_id: "video-id-54321",
          video_title: "Test video title",
          viewer_user_id: "user-id-007",
        }}
      />
    </div>
  )
}

export default MuxMediaPlayer