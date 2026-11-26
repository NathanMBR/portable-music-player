import type { InvokeArgs } from '@tauri-apps/api/core'
import { mockWindows } from '@tauri-apps/api/mocks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { failingCommand, mockCommands } from '../../testing/mockCommands'
import { shownNotifications } from '../../testing/notifications'
import type { Track } from '../library/types'
import { usePlaylistsStore } from '../playlists/playlistsStore'
import type { SavedPlaylist } from '../playlists/types'
import { playlistSource, SONGS_SOURCE } from './playbackSource'
import { usePlaybackStore } from './playbackStore'
import { connectWindowTitle } from './windowTitle'

const lastingChild: Track = {
  path: 'Songs/Lasting Child.mp3',
  title: 'Lasting Child',
  artist: 'Angra'
}
const makeBelieve: Track = {
  path: 'Songs/Make Believe.mp3',
  title: 'Make Believe',
  artist: 'Angra'
}

const playback = () => usePlaybackStore.getState()

/** Answers Tauri's own command for `setTitle`, and keeps every title the window was given. */
const mockWindowTitle = () => {
  const titles: string[] = []
  mockCommands({
    'plugin:window|set_title': (args?: InvokeArgs) => {
      titles.push((args as { value: string }).value)
    }
  })
  return titles
}

let disconnect = () => {}

const connect = () => {
  disconnect = connectWindowTitle()
}

// Lets the title's invoke() reach the mocked command.
const settle = () => new Promise(resolve => setTimeout(resolve))

describe('connectWindowTitle', () => {
  beforeEach(() => {
    mockWindows('main')
  })

  // Before the shared cleanup, whose store reset would otherwise retitle a window it already took away.
  afterEach(() => {
    disconnect()
  })

  it('names the window after the app while no song is in the player', async () => {
    const titles = mockWindowTitle()

    connect()
    await settle()

    expect(titles).toEqual(['Portable Music Player'])
  })

  it('names the window after the song in the player, and back after the app on Stop', async () => {
    const titles = mockWindowTitle()
    connect()

    playback().playTrack(lastingChild, [lastingChild, makeBelieve], SONGS_SOURCE)
    playback().playNext()
    playback().stop()
    await settle()

    expect(titles).toEqual([
      'Portable Music Player',
      'Lasting Child · Angra — Portable Music Player',
      'Make Believe · Angra — Portable Music Player',
      'Portable Music Player'
    ])
  })

  it("names the window after the song's tag title and artist, not its file name", async () => {
    const bringEmBackAlive: Track = {
      path: "Songs/05 Bring 'Em Back Alive.mp3",
      title: "Bring 'Em Back Alive",
      artist: 'Audioslave'
    }
    const titles = mockWindowTitle()
    connect()

    playback().playTrack(bringEmBackAlive, [bringEmBackAlive], SONGS_SOURCE)
    await settle()

    expect(titles).toEqual([
      'Portable Music Player',
      "Bring 'Em Back Alive · Audioslave — Portable Music Player"
    ])
  })

  it('names a song without an artist by its title alone', async () => {
    const soldierSide: Track = {
      path: 'Songs/Soldier Side - Intro.mp3',
      title: 'Soldier Side - Intro',
      artist: null
    }
    const titles = mockWindowTitle()
    connect()

    playback().playTrack(soldierSide, [soldierSide], SONGS_SOURCE)
    await settle()

    expect(titles.slice(-1)).toEqual(['Soldier Side - Intro — Portable Music Player'])
  })

  describe('with a song played from a playlist', () => {
    const yourTimeHasCome: Track = {
      path: 'Songs/Your Time Has Come.mp3',
      title: 'Your Time Has Come',
      artist: 'Audioslave'
    }
    const roadTrip: SavedPlaylist = {
      fileName: '1764190000000-Road_trip.json',
      title: 'Road trip',
      description: '',
      allSongsFound: true,
      songs: ['Your Time Has Come.mp3']
    }

    beforeEach(() => {
      usePlaylistsStore.setState({ playlists: [roadTrip] })
    })

    it('names the playlist after the artist, like the player bar', async () => {
      const titles = mockWindowTitle()
      connect()

      playback().playTrack(yourTimeHasCome, [yourTimeHasCome], playlistSource(roadTrip.fileName))
      await settle()

      expect(titles.slice(-1)).toEqual([
        'Your Time Has Come · Audioslave · Road trip — Portable Music Player'
      ])
    })

    it('follows the playlist as it is renamed, then deleted', async () => {
      const titles = mockWindowTitle()
      connect()
      playback().playTrack(yourTimeHasCome, [yourTimeHasCome], playlistSource(roadTrip.fileName))

      usePlaylistsStore.setState({ playlists: [{ ...roadTrip, title: 'Long drive' }] })
      usePlaylistsStore.setState({ playlists: [] })
      await settle()

      expect(titles.slice(-3)).toEqual([
        'Your Time Has Come · Audioslave · Road trip — Portable Music Player',
        'Your Time Has Come · Audioslave · Long drive — Portable Music Player',
        'Your Time Has Come · Audioslave — Portable Music Player'
      ])
    })
  })

  it('keeps the title while the song plays on or pauses', async () => {
    const setTitle = vi.fn()
    mockCommands({ 'plugin:window|set_title': setTitle })
    connect()
    playback().playTrack(lastingChild, [lastingChild], SONGS_SOURCE)

    playback().reportProgress(12)
    playback().togglePlaying()
    await settle()

    expect(setTitle).toHaveBeenCalledTimes(2)
  })

  it("says when the title can't change", async () => {
    mockCommands({ 'plugin:window|set_title': failingCommand('The window is gone') })

    connect()
    await settle()

    expect(shownNotifications()).toEqual([
      {
        type: 'error',
        title: "Couldn't change the window title",
        description: 'The window is gone'
      }
    ])
  })
})
