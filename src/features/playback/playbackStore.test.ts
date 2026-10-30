import { describe, expect, it } from 'vitest'
import { usePlaybackStore } from './playbackStore'

const firstTrackPath = 'Songs/A Monster in Her Eyes.mp3'
const secondTrackPath = 'Songs/Deep Blue.mp3'

describe('playbackStore', () => {
  it('starts with no song playing', () => {
    expect(usePlaybackStore.getState().playingTrackPath).toBeNull()
  })

  it('plays the toggled song', () => {
    usePlaybackStore.getState().togglePlayback(firstTrackPath)

    expect(usePlaybackStore.getState().playingTrackPath).toBe(firstTrackPath)
  })

  it('plays only one song at a time', () => {
    usePlaybackStore.getState().togglePlayback(firstTrackPath)

    usePlaybackStore.getState().togglePlayback(secondTrackPath)

    expect(usePlaybackStore.getState().playingTrackPath).toBe(secondTrackPath)
  })

  it('stops the playing song when it is toggled again', () => {
    usePlaybackStore.getState().togglePlayback(firstTrackPath)

    usePlaybackStore.getState().togglePlayback(firstTrackPath)

    expect(usePlaybackStore.getState().playingTrackPath).toBeNull()
  })
})
