import React from 'react'
import MuxPlayer from "@mux/mux-player-react";

type MuxMediaPlayerProps = {
  playbackId: string | null
  /** Bump to force a full player remount and reload the manifest (e.g. live not ready yet). */
  reloadNonce?: number
  streamType?: 'live' | 'on-demand'
  videoTitle?: string
}

const MuxMediaPlayer = ({
  playbackId,
  reloadNonce = 0,
  streamType = 'live',
  videoTitle = 'Live stream',
}: MuxMediaPlayerProps) => {
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
        key={`${playbackId}-${reloadNonce}-${streamType}`}
        playbackId={playbackId}
        streamType={streamType}
        metadata={{
          video_id: playbackId,
          video_title: videoTitle,
          viewer_user_id: 'viewer-local',
        }}
      />
    </div>
  )
}

export default MuxMediaPlayer