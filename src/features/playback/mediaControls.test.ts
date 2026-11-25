import { emit } from '@tauri-apps/api/event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Track } from '../library/types'
import { connectMediaControls } from './mediaControls'
import { SONGS_SOURCE } from './playbackSource'
import { usePlaybackStore } from './playbackStore'

const iAmTheHighway: Track = {
  path: 'Songs/I Am the Highway.mp3',
  title: 'I Am the Highway',
  artist: 'Audioslave'
}
const wutheringHeights: Track = {
  path: 'Songs/Wuthering Heights.mp3',
  title: 'Wuthering Heights',
  artist: 'Angra'
}
const queue = [iAmTheHighway, wutheringHeights]

const playback = () => usePlaybackStore.getState()
const session = () => usePlaybackStore.getState().session

// Listening goes through a few of Tauri's calls, each answered a moment later.
const settle = () => new Promise(resolve => setTimeout(resolve))

const press = async (control: object) => {
  await emit('playback:media-control', control)
  await settle()
}

describe('connectMediaControls', () => {
  let disconnect = () => {}

  beforeEach(async () => {
    disconnect = connectMediaControls()
    await settle()
    playback().playTrack(iAmTheHighway, queue, SONGS_SOURCE)
    playback().reportDuration(334)
  })

  afterEach(() => {
    disconnect()
  })

  it('pauses and plays from the media keys', async () => {
    await press({ action: 'pause' })
    expect(session()?.isPlaying).toBe(false)

    await press({ action: 'play' })
    expect(session()?.isPlaying).toBe(true)

    await press({ action: 'toggle' })
    expect(session()?.isPlaying).toBe(false)
  })

  it('goes to the next song and back', async () => {
    await press({ action: 'next' })
    expect(session()?.track).toEqual(wutheringHeights)

    await press({ action: 'previous' })
    expect(session()?.track).toEqual(iAmTheHighway)
  })

  it('jumps where the system media controls ask', async () => {
    await press({ action: 'seek', seconds: 83.5 })

    expect(session()?.elapsedSeconds).toBe(83.5)
  })

  it('stops the player', async () => {
    await press({ action: 'stop' })

    expect(session()).toBeNull()
  })
})
