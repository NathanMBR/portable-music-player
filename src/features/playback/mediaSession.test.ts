import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Track } from '../library/types'
import { connectMediaSession } from './mediaSession'
import { usePlaybackStore } from './playbackStore'

const waitingSilence: Track = { path: 'Songs/Waiting Silence.mp3', title: 'Waiting Silence' }
const deepBlue: Track = { path: 'Songs/Deep Blue.mp3', title: 'Deep Blue' }
const arisingThunder: Track = { path: 'Songs/Arising Thunder.mp3', title: 'Arising Thunder' }

const playback = () => usePlaybackStore.getState()
const session = () => usePlaybackStore.getState().session

/** Stands in for the webview's `MediaMetadata`, which jsdom lacks. */
class FakeMediaMetadata {
  title: string

  constructor(init: MediaMetadataInit = {}) {
    this.title = init.title ?? ''
  }
}

/**
 * Stands in for `navigator.mediaSession`, which jsdom lacks. Keeps every song title and play state
 * the player hands over, and presses the OS's media controls through the handlers it was given.
 */
const fakeMediaSession = () => {
  const shownTitles: (string | null)[] = []
  const playbackStates: MediaSessionPlaybackState[] = []
  const handlers = new Map<MediaSessionAction, MediaSessionActionHandler>()

  const mediaSession = {
    set metadata(metadata: MediaMetadata | null) {
      shownTitles.push(metadata?.title ?? null)
    },
    set playbackState(state: MediaSessionPlaybackState) {
      playbackStates.push(state)
    },
    setActionHandler: (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      if (handler) handlers.set(action, handler)
      else handlers.delete(action)
    }
  }
  vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
  Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: mediaSession })

  const press = (
    action: MediaSessionAction,
    details: Omit<MediaSessionActionDetails, 'action'> = {}
  ) => {
    const handler = handlers.get(action)
    if (!handler) throw new Error(`The OS's ${action} control does nothing`)
    handler({ action, ...details })
  }

  return { shownTitles, playbackStates, press }
}

let disconnect = () => {}

const connect = () => {
  disconnect = connectMediaSession()
}

describe('connectMediaSession', () => {
  // Before the shared cleanup, whose store reset would otherwise reach a media session already gone.
  afterEach(() => {
    disconnect()
    Reflect.deleteProperty(navigator, 'mediaSession')
    vi.unstubAllGlobals()
  })

  it('does nothing in webviews without a media session', () => {
    expect(() => {
      connect()
      playback().playTrack(waitingSilence, [waitingSilence])
    }).not.toThrow()
  })

  it('names the song in the player, and no song once the player stops', () => {
    const { shownTitles } = fakeMediaSession()
    connect()

    playback().playTrack(waitingSilence, [waitingSilence, deepBlue])
    playback().playNext()
    playback().stop()

    expect(shownTitles).toEqual(['Waiting Silence', 'Deep Blue', null])
  })

  it('tells whether the song plays, is paused, or none is in the player', () => {
    const { playbackStates } = fakeMediaSession()
    connect()

    playback().playTrack(deepBlue, [deepBlue])
    playback().togglePlaying()
    playback().stop()

    expect(playbackStates).toEqual(['playing', 'paused', 'none'])
  })

  it('hands over the song and its play state only when they change', () => {
    const { shownTitles, playbackStates } = fakeMediaSession()
    connect()
    playback().playTrack(arisingThunder, [arisingThunder])

    playback().reportDuration(254)
    playback().reportProgress(0.1)
    playback().reportProgress(0.2)
    playback().setVolume(0.5)

    expect(shownTitles).toEqual(['Arising Thunder'])
    expect(playbackStates).toEqual(['playing'])
  })

  it("plays and pauses the song from the OS's media controls", () => {
    const { press } = fakeMediaSession()
    connect()
    playback().playTrack(waitingSilence, [waitingSilence])

    press('pause')
    expect(session()?.isPlaying).toBe(false)

    press('play')
    expect(session()?.isPlaying).toBe(true)
  })

  it("stops the player from the OS's media controls", () => {
    const { press } = fakeMediaSession()
    connect()
    playback().playTrack(deepBlue, [deepBlue])

    press('stop')

    expect(session()).toBeNull()
  })

  it("skips to the next and the previous song from the OS's media controls", () => {
    const { press } = fakeMediaSession()
    connect()
    playback().playTrack(deepBlue, [deepBlue, arisingThunder])

    press('nexttrack')
    expect(session()?.track).toBe(arisingThunder)

    press('previoustrack')
    expect(session()?.track).toBe(deepBlue)
  })

  it("moves the song to where the OS's media controls seek", () => {
    const { press } = fakeMediaSession()
    connect()
    playback().playTrack(arisingThunder, [arisingThunder])
    playback().reportDuration(254)

    press('seekto', { seekTime: 97 })

    expect(session()?.elapsedSeconds).toBe(97)
  })
})
