import { describe, expect, it } from 'vitest'
import type { Track } from '../library/types'
import { type PlaybackSession, usePlaybackStore } from './playbackStore'

const trackTitled = (title: string): Track => ({ path: `Songs/${title}.mp3`, title })

const firstTrack = trackTitled('Petrified Eyes')
const secondTrack = trackTitled('A Monster in Her Eyes')
const thirdTrack = trackTitled('Viderunt Te Aquae')
const fourthTrack = trackTitled('Sprouts of Time')
const queue = [firstTrack, secondTrack, thirdTrack, fourthTrack]

const playback = () => usePlaybackStore.getState()
const session = () => usePlaybackStore.getState().session

const sortedTitles = (tracks: Track[] | undefined) => tracks?.map(track => track.title).sort()

/** A song that has been playing for a while, from the queue in list order unless overridden. */
const loadSession = (overrides: Partial<PlaybackSession>) => {
  usePlaybackStore.setState({
    session: {
      track: secondTrack,
      queue,
      playOrder: queue,
      isPlaying: true,
      elapsedSeconds: 83,
      durationSeconds: 270,
      ...overrides
    }
  })
}

describe('playTrack', () => {
  it('starts with no song, so the player is hidden', () => {
    expect(session()).toBeNull()
  })

  it('plays the chosen song from its start, with the list it was played from as the queue', () => {
    playback().playTrack(secondTrack, queue)

    expect(session()).toEqual({
      track: secondTrack,
      queue,
      playOrder: queue,
      isPlaying: true,
      elapsedSeconds: 0,
      durationSeconds: null
    })
  })

  it('starts a shuffled order with the chosen song while shuffle is on', () => {
    usePlaybackStore.setState({ isShuffled: true })

    playback().playTrack(thirdTrack, queue)

    expect(session()?.playOrder[0]).toBe(thirdTrack)
    expect(sortedTitles(session()?.playOrder)).toEqual(sortedTitles(queue))
  })
})

describe('togglePlaying', () => {
  it('pauses the playing song, then resumes it', () => {
    playback().playTrack(firstTrack, queue)

    playback().togglePlaying()
    expect(session()?.isPlaying).toBe(false)

    playback().togglePlaying()
    expect(session()?.isPlaying).toBe(true)
  })
})

describe('stop', () => {
  it('hides the player and forgets the song and its queue', () => {
    loadSession({})

    playback().stop()

    expect(session()).toBeNull()
  })

  it('keeps repeat, shuffle, volume and the shown time for the next song', () => {
    const preferences = {
      repeatMode: 'one',
      isShuffled: true,
      volume: 0.4,
      shownTime: 'remaining'
    } as const
    usePlaybackStore.setState(preferences)
    loadSession({})

    playback().stop()

    expect(playback()).toMatchObject(preferences)
  })
})

describe('playNext and playPrevious', () => {
  it('play the next and the previous song from their start', () => {
    loadSession({ track: secondTrack })

    playback().playNext()
    expect(session()).toMatchObject({ track: thirdTrack, elapsedSeconds: 0, durationSeconds: null })

    playback().playPrevious()
    playback().playPrevious()
    expect(session()?.track).toBe(firstTrack)
  })

  it('play the new song even when the current one is paused', () => {
    loadSession({ track: secondTrack, isPlaying: false })

    playback().playNext()

    expect(session()).toMatchObject({ track: thirdTrack, isPlaying: true })
  })

  it('follow the play order, which shuffle may have changed', () => {
    loadSession({
      track: firstTrack,
      playOrder: [firstTrack, fourthTrack, secondTrack, thirdTrack]
    })

    playback().playNext()

    expect(session()?.track).toBe(fourthTrack)
  })

  it('stay on the song at either end of the queue without repeat', () => {
    loadSession({ track: fourthTrack })
    playback().playNext()
    expect(session()).toMatchObject({ track: fourthTrack, elapsedSeconds: 83 })

    // Within its first seconds, so Previous goes back instead of starting the song over.
    loadSession({ track: firstTrack, elapsedSeconds: 2 })
    playback().playPrevious()
    expect(session()).toMatchObject({ track: firstTrack, elapsedSeconds: 2 })
  })

  it('wrap around the queue with repeat on', () => {
    usePlaybackStore.setState({ repeatMode: 'all' })
    loadSession({ track: fourthTrack })

    playback().playNext()
    expect(session()?.track).toBe(firstTrack)

    playback().playPrevious()
    expect(session()?.track).toBe(fourthTrack)
  })

  it('keep the known length of a song that plays again, alone in its queue with repeat all', () => {
    usePlaybackStore.setState({ repeatMode: 'all' })
    loadSession({ track: firstTrack, queue: [firstTrack], playOrder: [firstTrack] })

    playback().playNext()

    expect(session()).toMatchObject({ track: firstTrack, elapsedSeconds: 0, durationSeconds: 270 })
  })
})

describe('playPrevious', () => {
  it('starts the current song over past its first 3 seconds, keeping its known length', () => {
    loadSession({ track: thirdTrack, elapsedSeconds: 83, isPlaying: false })

    playback().playPrevious()

    expect(session()).toMatchObject({
      track: thirdTrack,
      isPlaying: true,
      elapsedSeconds: 0,
      durationSeconds: 270
    })
  })

  it('goes to the previous song within the first 3 seconds', () => {
    loadSession({ track: thirdTrack, elapsedSeconds: 2 })

    playback().playPrevious()

    expect(session()).toMatchObject({
      track: secondTrack,
      elapsedSeconds: 0,
      durationSeconds: null
    })
  })
})

describe('finishSong', () => {
  it('plays the next song from its start', () => {
    loadSession({ track: secondTrack, elapsedSeconds: 270 })

    playback().finishSong()

    expect(session()).toMatchObject({
      track: thirdTrack,
      isPlaying: true,
      elapsedSeconds: 0,
      durationSeconds: null
    })
  })

  it('goes on to the first song after the last one with repeat all', () => {
    usePlaybackStore.setState({ repeatMode: 'all' })
    loadSession({ track: fourthTrack, elapsedSeconds: 270 })

    playback().finishSong()

    expect(session()?.track).toBe(firstTrack)
  })

  it('plays the same song again with repeat one, keeping its known length', () => {
    usePlaybackStore.setState({ repeatMode: 'one' })
    loadSession({ track: secondTrack, elapsedSeconds: 270 })

    playback().finishSong()

    expect(session()).toMatchObject({
      track: secondTrack,
      isPlaying: true,
      elapsedSeconds: 0,
      durationSeconds: 270
    })
  })

  it('stays on the last song without repeat, paused and back at its start', () => {
    loadSession({ track: fourthTrack, elapsedSeconds: 270 })

    playback().finishSong()

    expect(session()).toMatchObject({
      track: fourthTrack,
      isPlaying: false,
      elapsedSeconds: 0,
      durationSeconds: 270
    })
  })
})

describe('reportProgress and reportDuration', () => {
  it('keep the time and the length the audio reports', () => {
    loadSession({ elapsedSeconds: 0, durationSeconds: null })

    playback().reportDuration(270)
    playback().reportProgress(12.5)

    expect(session()).toMatchObject({ elapsedSeconds: 12.5, durationSeconds: 270 })
  })

  it('are ignored without a song in the player', () => {
    playback().reportDuration(270)
    playback().reportProgress(12.5)

    expect(session()).toBeNull()
  })
})

describe('seek', () => {
  it('moves the position within the song', () => {
    loadSession({ elapsedSeconds: 83 })

    playback().seek(200)

    expect(session()?.elapsedSeconds).toBe(200)
  })

  it('keeps the position between the start and the end of the song', () => {
    loadSession({ elapsedSeconds: 83, durationSeconds: 270 })

    playback().seek(-5)
    expect(session()?.elapsedSeconds).toBe(0)

    playback().seek(300)
    expect(session()?.elapsedSeconds).toBe(270)
  })

  it('is ignored while the length of the song is unknown', () => {
    loadSession({ elapsedSeconds: 0, durationSeconds: null })

    playback().seek(200)

    expect(session()?.elapsedSeconds).toBe(0)
  })
})

describe('play', () => {
  it('plays the paused song, and leaves a playing one playing', () => {
    loadSession({ isPlaying: false })

    playback().play()
    expect(session()?.isPlaying).toBe(true)

    playback().play()
    expect(session()?.isPlaying).toBe(true)
  })

  it('is ignored without a song in the player', () => {
    playback().play()

    expect(session()).toBeNull()
  })
})

describe('pause', () => {
  it('pauses the song, and leaves a paused one paused', () => {
    loadSession({ isPlaying: true })

    playback().pause()
    expect(session()?.isPlaying).toBe(false)

    playback().pause()
    expect(session()?.isPlaying).toBe(false)
  })
})

describe('cycleRepeatMode', () => {
  it('cycles from off to all to one, then back to off', () => {
    expect(playback().repeatMode).toBe('off')

    playback().cycleRepeatMode()
    expect(playback().repeatMode).toBe('all')

    playback().cycleRepeatMode()
    expect(playback().repeatMode).toBe('one')

    playback().cycleRepeatMode()
    expect(playback().repeatMode).toBe('off')
  })
})

describe('toggleShuffle', () => {
  it('keeps the current song and plays the rest of the queue after it in random order', () => {
    loadSession({ track: thirdTrack })

    playback().toggleShuffle()

    expect(playback().isShuffled).toBe(true)
    expect(session()?.track).toBe(thirdTrack)
    expect(session()?.playOrder[0]).toBe(thirdTrack)
    expect(sortedTitles(session()?.playOrder)).toEqual(sortedTitles(queue))
  })

  it('returns to the order of the queue when turned off, going on from the current song', () => {
    usePlaybackStore.setState({ isShuffled: true })
    loadSession({
      track: thirdTrack,
      playOrder: [thirdTrack, firstTrack, fourthTrack, secondTrack]
    })

    playback().toggleShuffle()
    expect(playback().isShuffled).toBe(false)
    expect(session()?.playOrder).toEqual(queue)

    playback().playNext()
    expect(session()?.track).toBe(fourthTrack)
  })

  it('can be turned on before any song plays', () => {
    playback().toggleShuffle()

    expect(playback().isShuffled).toBe(true)
    expect(session()).toBeNull()
  })
})

describe('setVolume', () => {
  it('starts at full volume and takes the chosen one', () => {
    expect(playback().volume).toBe(1)

    playback().setVolume(0.4)

    expect(playback().volume).toBe(0.4)
  })
})

describe('toggleMute', () => {
  it('silences the volume, then brings back the one it had', () => {
    playback().setVolume(0.4)

    playback().toggleMute()
    expect(playback().volume).toBe(0)

    playback().toggleMute()
    expect(playback().volume).toBe(0.4)
  })

  it('brings back full volume when the slider was moved down to silent', () => {
    playback().setVolume(0.4)
    playback().toggleMute()
    playback().toggleMute()
    playback().setVolume(0)

    playback().toggleMute()

    expect(playback().volume).toBe(1)
  })

  it('silences a volume moved by the slider after muting, not the one from before', () => {
    playback().setVolume(0.4)
    playback().toggleMute()
    playback().setVolume(0.7)

    playback().toggleMute()
    playback().toggleMute()

    expect(playback().volume).toBe(0.7)
  })
})

describe('toggleShownTime', () => {
  it('switches the time left of the progress bar between elapsed and remaining', () => {
    expect(playback().shownTime).toBe('elapsed')

    playback().toggleShownTime()
    expect(playback().shownTime).toBe('remaining')

    playback().toggleShownTime()
    expect(playback().shownTime).toBe('elapsed')
  })
})
