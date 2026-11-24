import type { InvokeArgs } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { mockWindows } from '@tauri-apps/api/mocks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockCommands } from '../../testing/mockCommands'
import { useLibraryStore } from '../library/libraryStore'
import type { Track } from '../library/types'
import { usePlaylistsStore } from '../playlists/playlistsStore'
import type { SavedPlaylist } from '../playlists/types'
import { useSettingsStore } from '../settings/settingsStore'
import type { SavedPlayback, Settings } from '../settings/types'
import { PLAYBACK_SAVE_DELAY_MS } from './constants'
import { connectPlaybackMemory, restorePlayback } from './playbackMemory'
import { playlistSource, SONGS_SOURCE } from './playbackSource'
import { usePlaybackStore } from './playbackStore'

const jewelOfTheSummertime: Track = {
  path: 'Songs/Jewel of the Summertime.mp3',
  title: 'Jewel of the Summertime',
  artist: 'Audioslave'
}
const theGreatEscape: Track = {
  path: 'Songs/05 The Great Escape.mp3',
  title: 'The Great Escape',
  artist: 'Woodkid'
}
const theHouseJackBuilt: Track = {
  path: 'Songs/The House Jack Built.mp3',
  title: 'The House Jack Built',
  artist: 'Metallica'
}
const blindSpell: Track = {
  path: 'Songs/Blind Spell.mp3',
  title: 'Blind Spell',
  artist: 'Shaman'
}

// In the order Rust lists them, which isn't the Songs view's.
const scannedTracks = [theHouseJackBuilt, blindSpell, theGreatEscape, jewelOfTheSummertime]

const NOTHING_SAVED: SavedPlayback = {
  volume: 1,
  isMuted: false,
  repeatMode: 'off',
  isShuffled: false,
  song: null
}

const ROAD_TRIP = '1763581234567-Road_trip.json'

const roadTrip: SavedPlaylist = {
  fileName: ROAD_TRIP,
  title: 'Road trip',
  description: '',
  allSongsFound: false,
  songs: ['Blind Spell.mp3', 'Motorbreath.mp3', '05 The Great Escape.mp3']
}

const listed = (...playlists: SavedPlaylist[]) =>
  usePlaylistsStore.setState({ playlists, loadStatus: 'loaded' })

const playback = () => usePlaybackStore.getState()

/** The settings as they were loaded, with what the player was left with. */
const loadSettingsWith = (
  playbackLeft: Partial<SavedPlayback>,
  changes: Partial<Settings> = {}
) => {
  const { settings } = useSettingsStore.getState()
  useSettingsStore.setState({
    settings: { ...settings, ...changes, playback: { ...NOTHING_SAVED, ...playbackLeft } }
  })
}

const scan = (tracks: Track[]) => useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks } })

const savedPlaybackIn = (args?: InvokeArgs) => (args as { settings: Settings }).settings.playback

/** Answers the settings saves, and keeps the player's state each one saved. */
const mockSaves = () => {
  const saves: SavedPlayback[] = []
  mockCommands({
    save_settings: args => {
      saves.push(savedPlaybackIn(args))
    }
  })
  return saves
}

describe('restorePlayback', () => {
  it('puts back the volume, mute, repeat and shuffle', () => {
    loadSettingsWith({ volume: 0.45, isMuted: true, repeatMode: 'all', isShuffled: true })
    scan(scannedTracks)

    restorePlayback()

    expect(playback()).toMatchObject({
      volume: 0.45,
      isMuted: true,
      repeatMode: 'all',
      isShuffled: true,
      session: null
    })
  })

  it('finds the song by its file name and puts it back paused, queued as the Songs view sorts', () => {
    const saves = mockSaves()
    loadSettingsWith(
      { song: { fileName: '05 The Great Escape.mp3', elapsedSeconds: 131.75, playlist: null } },
      { songOrder: 'fileName' }
    )
    scan(scannedTracks)

    restorePlayback()

    expect(playback().session).toMatchObject({
      track: theGreatEscape,
      queue: [theGreatEscape, blindSpell, jewelOfTheSummertime, theHouseJackBuilt],
      isPlaying: false,
      elapsedSeconds: 131.75
    })
    expect(saves).toEqual([])
  })

  it('puts back a song saved from a playlist in that playlist, queued with its songs in its order', () => {
    const saves = mockSaves()
    loadSettingsWith({
      song: { fileName: '05 The Great Escape.mp3', elapsedSeconds: 48.5, playlist: ROAD_TRIP }
    })
    scan(scannedTracks)
    listed(roadTrip)

    restorePlayback()

    expect(playback().session).toMatchObject({
      track: theGreatEscape,
      queue: [blindSpell, theGreatEscape],
      isPlaying: false,
      elapsedSeconds: 48.5,
      source: playlistSource(ROAD_TRIP)
    })
    expect(saves).toEqual([])
  })

  it('puts the song back in the Songs view when its playlist is gone, and saves that', () => {
    const saves = mockSaves()
    loadSettingsWith({
      song: { fileName: 'Blind Spell.mp3', elapsedSeconds: 7, playlist: ROAD_TRIP }
    })
    scan(scannedTracks)
    listed()

    restorePlayback()

    expect(playback().session).toMatchObject({ track: blindSpell, source: SONGS_SOURCE })
    expect(saves.map(saved => saved.song)).toEqual([
      { fileName: 'Blind Spell.mp3', elapsedSeconds: 7, playlist: null }
    ])
  })

  it('puts the song back in the Songs view when its playlist no longer holds it', () => {
    loadSettingsWith({
      song: { fileName: 'Jewel of the Summertime.mp3', elapsedSeconds: 7, playlist: ROAD_TRIP }
    })
    scan(scannedTracks)
    listed(roadTrip)

    restorePlayback()

    expect(playback().session).toMatchObject({
      track: jewelOfTheSummertime,
      source: SONGS_SOURCE
    })
  })

  it('forgets a song no longer in the Songs folder, keeping the player closed', () => {
    const saves = mockSaves()
    loadSettingsWith({
      volume: 0.3,
      song: { fileName: 'Blind Spell.mp3', elapsedSeconds: 20, playlist: null }
    })
    scan([theHouseJackBuilt, jewelOfTheSummertime])

    restorePlayback()

    expect(playback()).toMatchObject({ volume: 0.3, session: null })
    expect(saves).toEqual([{ ...NOTHING_SAVED, volume: 0.3, song: null }])
  })

  it("forgets the song when the Songs folder couldn't be read, keeping the player closed", () => {
    const saves = mockSaves()
    loadSettingsWith({ song: { fileName: 'Blind Spell.mp3', elapsedSeconds: 20, playlist: null } })
    useLibraryStore.setState({ lastScan: { kind: 'failed' } })

    restorePlayback()

    expect(playback().session).toBeNull()
    expect(saves.map(saved => saved.song)).toEqual([null])
  })
})

describe('connectPlaybackMemory', () => {
  let disconnect = () => {}

  const connect = () => {
    disconnect = connectPlaybackMemory()
  }

  beforeEach(() => {
    mockWindows('main')
    vi.useFakeTimers()
  })

  // Before the shared cleanup, whose store reset would otherwise count as a change to save.
  afterEach(() => {
    disconnect()
    vi.useRealTimers()
  })

  it("saves the player's state a moment after it changes", async () => {
    const saves = mockSaves()
    connect()

    playback().playTrack(blindSpell, [blindSpell, theHouseJackBuilt], SONGS_SOURCE)
    playback().cycleRepeatMode()
    playback().toggleShuffle()
    await vi.advanceTimersByTimeAsync(PLAYBACK_SAVE_DELAY_MS)

    expect(saves).toEqual([
      {
        volume: 1,
        isMuted: false,
        repeatMode: 'all',
        isShuffled: true,
        song: { fileName: 'Blind Spell.mp3', elapsedSeconds: 0, playlist: null }
      }
    ])
  })

  it('saves the playlist the song plays from, by its file name', async () => {
    const saves = mockSaves()
    connect()

    playback().playTrack(theGreatEscape, [theGreatEscape], playlistSource(ROAD_TRIP))
    await vi.advanceTimersByTimeAsync(PLAYBACK_SAVE_DELAY_MS)

    expect(saves.map(saved => saved.song)).toEqual([
      { fileName: '05 The Great Escape.mp3', elapsedSeconds: 0, playlist: ROAD_TRIP }
    ])
  })

  it('saves again when the same song goes on from another list', async () => {
    const saves = mockSaves()
    playback().playTrack(blindSpell, [blindSpell, theHouseJackBuilt], SONGS_SOURCE)
    connect()

    playback().playTrack(blindSpell, [blindSpell], playlistSource(ROAD_TRIP))
    await vi.advanceTimersByTimeAsync(PLAYBACK_SAVE_DELAY_MS)

    expect(saves.map(saved => saved.song?.playlist)).toEqual([ROAD_TRIP])
  })

  it('waits for changes to stop, so turning the mouse wheel saves once, where it stops', async () => {
    const saves = mockSaves()
    connect()

    playback().setVolume(0.95)
    await vi.advanceTimersByTimeAsync(PLAYBACK_SAVE_DELAY_MS / 2)
    playback().setVolume(0.9)
    await vi.advanceTimersByTimeAsync(PLAYBACK_SAVE_DELAY_MS / 2)
    playback().setVolume(0.85)
    await vi.advanceTimersByTimeAsync(PLAYBACK_SAVE_DELAY_MS)

    expect(saves.map(saved => saved.volume)).toEqual([0.85])
  })

  it('saves nothing while the volume slider moves, and the volume where it is released', async () => {
    const saves = mockSaves()
    connect()

    playback().moveVolume(0.9)
    playback().moveVolume(0.5)
    await vi.advanceTimersByTimeAsync(PLAYBACK_SAVE_DELAY_MS)
    expect(saves).toEqual([])

    playback().setVolume(0.5)
    await vi.advanceTimersByTimeAsync(PLAYBACK_SAVE_DELAY_MS)
    expect(saves.map(saved => saved.volume)).toEqual([0.5])
  })

  it('saves a release of the volume slider at silent as muted, keeping the volume', async () => {
    const saves = mockSaves()
    playback().setVolume(0.6)
    connect()

    playback().moveVolume(0)
    playback().setVolume(0)
    await vi.advanceTimersByTimeAsync(PLAYBACK_SAVE_DELAY_MS)

    expect(saves).toEqual([{ ...NOTHING_SAVED, volume: 0.6, isMuted: true }])
  })

  it('saves nothing while the song just plays on', async () => {
    const saves = mockSaves()
    playback().playTrack(jewelOfTheSummertime, [jewelOfTheSummertime], SONGS_SOURCE)
    connect()

    playback().reportDuration(279)
    playback().reportProgress(12.4)
    await vi.advanceTimersByTimeAsync(PLAYBACK_SAVE_DELAY_MS)

    expect(saves).toEqual([])
  })

  it('saves where the song was paused', async () => {
    const saves = mockSaves()
    playback().playTrack(jewelOfTheSummertime, [jewelOfTheSummertime], SONGS_SOURCE)
    connect()

    playback().reportProgress(64.3)
    playback().pause()
    await vi.advanceTimersByTimeAsync(PLAYBACK_SAVE_DELAY_MS)

    expect(saves.map(saved => saved.song)).toEqual([
      { fileName: 'Jewel of the Summertime.mp3', elapsedSeconds: 64.3, playlist: null }
    ])
  })

  it('saves no song once the player is stopped', async () => {
    const saves = mockSaves()
    playback().playTrack(theHouseJackBuilt, [theHouseJackBuilt], SONGS_SOURCE)
    connect()

    playback().stop()
    await vi.advanceTimersByTimeAsync(PLAYBACK_SAVE_DELAY_MS)

    expect(saves.map(saved => saved.song)).toEqual([null])
  })

  it('saves where the song has played to when the window closes, and only then closes it', async () => {
    const events: string[] = []
    mockCommands({
      save_settings: args => {
        events.push(`saved at ${savedPlaybackIn(args).song?.elapsedSeconds}`)
      },
      'plugin:window|destroy': () => {
        events.push('closed')
      }
    })
    playback().playTrack(theHouseJackBuilt, [theHouseJackBuilt], SONGS_SOURCE)
    connect()

    playback().setVolume(0.4)
    playback().reportProgress(201.5)
    await emit('tauri://close-requested')

    await vi.waitFor(() => expect(events).toEqual(['saved at 201.5', 'closed']))
    await vi.advanceTimersByTimeAsync(PLAYBACK_SAVE_DELAY_MS)
    expect(events).toEqual(['saved at 201.5', 'closed'])
  })
})
