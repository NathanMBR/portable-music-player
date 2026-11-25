import type { InvokeArgs } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest'
import { loggedMessages } from '../../testing/logs'
import { type CommandHandler, failingCommand, mockCommands } from '../../testing/mockCommands'
import { shownNotifications } from '../../testing/notifications'
import type { Track } from '../library/types'
import { SONGS_SOURCE } from './playbackSource'
import { usePlaybackStore } from './playbackStore'
import { connectSongEngine } from './songEngine'
import type { SongRequest } from './types'

const trackTitled = (title: string, artist: string): Track => ({
  path: `Songs/${title}.mp3`,
  title,
  artist
})

const firstTrack = trackTitled('Mystery Machine', 'Angra')
const secondTrack = trackTitled('Original Fire', 'Audioslave')
const thirdTrack = trackTitled('Enemy', 'Woodkid')
const queue = [firstTrack, secondTrack, thirdTrack]

const SONG_DURATION_SECONDS = 251.5

const playback = () => usePlaybackStore.getState()
const session = () => usePlaybackStore.getState().session

const requestOf = (id: number, track: Track): SongRequest => ({
  id,
  path: track.path,
  title: track.title,
  artist: track.artist
})

// Commands answer through promises, and listening goes through a few of Tauri's calls.
const settle = () => new Promise(resolve => setTimeout(resolve))

type RustCommand =
  | 'play_song'
  | 'queue_next_song'
  | 'set_playing'
  | 'seek_song'
  | 'set_volume'
  | 'stop_playback'

type FakeRust = Record<RustCommand, Mock<CommandHandler>>

const fakeRust = (handlers: Partial<Record<RustCommand, CommandHandler>> = {}): FakeRust => {
  const rust: FakeRust = {
    play_song: vi.fn(handlers.play_song ?? (() => ({ durationSeconds: SONG_DURATION_SECONDS }))),
    queue_next_song: vi.fn(handlers.queue_next_song ?? (() => null)),
    set_playing: vi.fn(handlers.set_playing ?? (() => null)),
    seek_song: vi.fn(handlers.seek_song ?? (() => null)),
    set_volume: vi.fn(handlers.set_volume ?? (() => null)),
    stop_playback: vi.fn(handlers.stop_playback ?? (() => null))
  }
  mockCommands(rust)
  return rust
}

const argsOf = (command: Mock<CommandHandler>) =>
  command.mock.calls.map(([args]: [InvokeArgs?]) => args)

const lastArgsOf = (command: Mock<CommandHandler>) => command.mock.lastCall?.[0]

describe('connectSongEngine', () => {
  let disconnect = () => {}

  const connect = async (handlers: Partial<Record<RustCommand, CommandHandler>> = {}) => {
    const rust = fakeRust(handlers)
    disconnect = connectSongEngine()
    await settle()
    return rust
  }

  const play = async (track: Track) => {
    playback().playTrack(track, queue, SONGS_SOURCE)
    await settle()
  }

  afterEach(() => {
    disconnect()
  })

  it('plays the song the store starts', async () => {
    const rust = await connect()

    await play(firstTrack)

    expect(argsOf(rust.play_song)).toEqual([
      { song: requestOf(1, firstTrack), fromSeconds: 0, isPlaying: true }
    ])
  })

  it('puts a restored song back paused at its position', async () => {
    const rust = await connect()

    playback().restore({
      volume: 1,
      isMuted: false,
      repeatMode: 'off',
      isShuffled: false,
      song: { track: secondTrack, queue, elapsedSeconds: 42.5, source: SONGS_SOURCE }
    })
    await settle()

    expect(argsOf(rust.play_song)).toEqual([
      { song: requestOf(1, secondTrack), fromSeconds: 42.5, isPlaying: false }
    ])
  })

  it('reports the length Rust read', async () => {
    await connect()

    await play(firstTrack)

    expect(session()?.durationSeconds).toBe(SONG_DURATION_SECONDS)
  })

  it('queues the next song once the current one is ready', async () => {
    const rust = await connect()

    await play(firstTrack)

    expect(argsOf(rust.queue_next_song)).toEqual([{ afterId: 1, song: requestOf(2, secondTrack) }])
  })

  it('queues the same song again with repeat one', async () => {
    const rust = await connect()
    usePlaybackStore.setState({ repeatMode: 'one' })

    await play(firstTrack)

    expect(argsOf(rust.queue_next_song)).toEqual([{ afterId: 1, song: requestOf(2, firstTrack) }])
  })

  it('queues nothing after the last song without repeat', async () => {
    const rust = await connect()

    await play(thirdTrack)

    expect(rust.queue_next_song).not.toHaveBeenCalled()
  })

  it('queues again when the song after the current one changes', async () => {
    const rust = await connect()
    await play(thirdTrack)

    playback().cycleRepeatMode()
    await settle()

    expect(argsOf(rust.queue_next_song)).toEqual([{ afterId: 1, song: requestOf(2, firstTrack) }])
  })

  it('moves on to the queued song without loading it again', async () => {
    const rust = await connect()
    await play(firstTrack)

    await emit('playback:song-started', { id: 2, durationSeconds: 188 })
    await settle()

    expect(session()).toMatchObject({
      track: secondTrack,
      isPlaying: true,
      elapsedSeconds: 0,
      durationSeconds: 188
    })
    expect(rust.play_song).toHaveBeenCalledTimes(1)
    expect(lastArgsOf(rust.queue_next_song)).toEqual({
      afterId: 2,
      song: requestOf(3, thirdTrack)
    })
  })

  it('logs the queued song as started', async () => {
    await connect()
    await play(firstTrack)

    await emit('playback:song-started', { id: 2, durationSeconds: 188 })
    await settle()

    expect(loggedMessages()).toContain(`Started playing song "${secondTrack.title}"`)
  })

  it('stops after the last song', async () => {
    const rust = await connect()
    await play(thirdTrack)

    await emit('playback:song-ended', { id: 1 })
    await settle()

    expect(session()).toMatchObject({ track: thirdTrack, isPlaying: false, elapsedSeconds: 0 })
    expect(argsOf(rust.set_playing)).toEqual([{ isPlaying: false }])
    expect(loggedMessages()).toContain(`Stopped playing song "${thirdTrack.title}"`)
  })

  it('plays the next song itself when Rust ended without it', async () => {
    const rust = await connect()
    await play(firstTrack)

    await emit('playback:song-ended', { id: 1 })
    await settle()

    expect(session()?.track).toEqual(secondTrack)
    expect(lastArgsOf(rust.play_song)).toEqual({
      song: requestOf(3, secondTrack),
      fromSeconds: 0,
      isPlaying: true
    })
  })

  it('jumps when the store seeks', async () => {
    const rust = await connect()
    await play(firstTrack)

    playback().seek(42)
    await settle()

    expect(argsOf(rust.seek_song)).toEqual([{ seconds: 42 }])
  })

  it('shows the progress Rust reports without jumping', async () => {
    const rust = await connect()
    await play(firstTrack)

    await emit('playback:progress', { id: 1, seconds: 12.5 })
    await settle()

    expect(session()?.elapsedSeconds).toBe(12.5)
    expect(rust.seek_song).not.toHaveBeenCalled()
  })

  it('ignores progress sent before a jump reached Rust', async () => {
    let finishSeek = () => {}
    await connect({
      seek_song: () =>
        new Promise<null>(resolve => {
          finishSeek = () => resolve(null)
        })
    })
    await play(firstTrack)

    playback().seek(100)
    await emit('playback:progress', { id: 1, seconds: 12.5 })
    await settle()
    expect(session()?.elapsedSeconds).toBe(100)

    finishSeek()
    await settle()
    await emit('playback:progress', { id: 1, seconds: 100.1 })
    await settle()
    expect(session()?.elapsedSeconds).toBe(100.1)
  })

  it('pauses and plays again through Rust', async () => {
    const rust = await connect()
    await play(firstTrack)

    playback().togglePlaying()
    playback().togglePlaying()
    await settle()

    expect(argsOf(rust.set_playing)).toEqual([{ isPlaying: false }, { isPlaying: true }])
  })

  it('plays at the volume heard', async () => {
    const rust = await connect()
    await play(firstTrack)

    playback().setVolume(0.4)
    await settle()
    expect(lastArgsOf(rust.set_volume)).toEqual({ volume: 0.4 })

    playback().toggleMute()
    await settle()
    expect(lastArgsOf(rust.set_volume)).toEqual({ volume: 0 })
  })

  it('empties Rust when the player stops', async () => {
    const rust = await connect()
    await play(firstTrack)

    playback().stop()
    await settle()

    expect(rust.stop_playback).toHaveBeenCalledTimes(1)
  })

  it('notifies a song that cannot be played, and pauses', async () => {
    const reason = `Couldn't decode ${firstTrack.path}: the file may be damaged`
    await connect({ play_song: failingCommand(reason) })

    await play(firstTrack)

    expect(shownNotifications()).toEqual([
      { type: 'error', title: `Couldn't play ${firstTrack.title}`, description: reason }
    ])
    expect(session()?.isPlaying).toBe(false)
  })

  it('plays a song that failed again when asked', async () => {
    const rust = await connect({ play_song: failingCommand('The file is missing') })
    await play(firstTrack)

    playback().play()
    await settle()

    expect(rust.play_song).toHaveBeenCalledTimes(2)
  })

  it('notifies a lost sound output, and pauses', async () => {
    await connect()
    await play(firstTrack)

    const reason = 'No sound output was found on this computer'
    await emit('playback:output-lost', { reason })
    await settle()

    expect(shownNotifications()).toEqual([
      { type: 'error', title: 'Lost the sound output', description: reason }
    ])
    expect(session()?.isPlaying).toBe(false)
  })

  it('ignores the events of a song no longer in the player', async () => {
    await connect()
    await play(firstTrack)
    await play(secondTrack)

    await emit('playback:progress', { id: 1, seconds: 30 })
    await emit('playback:song-ended', { id: 1 })
    await emit('playback:song-started', { id: 2, durationSeconds: 188 })
    await settle()

    expect(session()).toMatchObject({ track: secondTrack, isPlaying: true, elapsedSeconds: 0 })
    expect(session()?.durationSeconds).toBe(SONG_DURATION_SECONDS)
  })

  it('drops what Rust read of a song replaced meanwhile', async () => {
    let finishFirst = () => {}
    await connect({
      play_song: args => {
        const { song } = args as { song: SongRequest }
        if (song.path !== firstTrack.path) {
          return { durationSeconds: 188 }
        }
        return new Promise(resolve => {
          finishFirst = () => resolve({ durationSeconds: SONG_DURATION_SECONDS })
        })
      }
    })
    playback().playTrack(firstTrack, queue, SONGS_SOURCE)
    await play(secondTrack)

    finishFirst()
    await settle()

    expect(session()).toMatchObject({ track: secondTrack, durationSeconds: 188 })
  })
})
