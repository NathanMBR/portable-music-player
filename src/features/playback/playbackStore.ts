import { create } from 'zustand'

type PlaybackStore = {
  /** A single path, so only one song can be playing at a time. */
  playingTrackPath: string | null
  togglePlayback: (trackPath: string) => void
}

export const usePlaybackStore = create<PlaybackStore>()(set => ({
  playingTrackPath: null,
  togglePlayback: trackPath =>
    set(state => ({
      playingTrackPath: state.playingTrackPath === trackPath ? null : trackPath
    }))
}))
