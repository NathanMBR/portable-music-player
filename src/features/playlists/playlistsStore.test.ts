import type { InvokeArgs } from '@tauri-apps/api/core'
import { describe, expect, it, vi } from 'vitest'
import { loggedMessages } from '../../testing/logs'
import { failingCommand, mockCommands } from '../../testing/mockCommands'
import { clickNotificationAction, shownNotifications } from '../../testing/notifications'
import { useLibraryStore } from '../library/libraryStore'
import type { Track } from '../library/types'
import { useNavigationStore } from '../navigation/navigationStore'
import { usePlaybackStore } from '../playback/playbackStore'
import { usePlaylistsStore } from './playlistsStore'
import type { PlaylistCheck, SavedPlaylist } from './types'

const blackened: Track = { path: 'Songs/Blackened.mp3', title: 'Blackened', artist: 'Metallica' }
const makeBelieve: Track = {
  path: 'Songs/Make Believe.mp3',
  title: 'Make Believe',
  artist: 'Angra'
}
const reason: Track = { path: 'Songs/Reason.mp3', title: 'Reason', artist: 'Shaman' }
const sadStatue: Track = {
  path: 'Songs/Sad Statue.mp3',
  title: 'Sad Statue',
  artist: 'System of a Down'
}

const roadTrip: SavedPlaylist = {
  fileName: '1763581234567-Road_trip.json',
  title: 'Road trip',
  description: 'For the long drive',
  allSongsFound: true,
  songs: ['Make Believe.mp3', 'Blackened.mp3', 'Sad Statue.mp3']
}
const calmEvening: SavedPlaylist = {
  fileName: '1763581299999-Calm_evening.json',
  title: 'Calm evening',
  description: '',
  allSongsFound: true,
  songs: ['Viderunt Te Aquae.mp3']
}

const LIST_ERROR =
  "Couldn't read the Playlists folder at /media/usb/Playlists: Input/output error (os error 5)"
const MISSING_ERROR =
  "Couldn't find the playlist 1763581234567-Road_trip.json: it may have been moved, renamed or deleted"
const DELETE_ERROR =
  "Couldn't delete the playlist 1763581234567-Road_trip.json: Read-only file system (os error 30)"
const TAKEN_ERROR = 'A playlist named 1763581234567-Road_trip.json already exists'

const playlists = () => usePlaylistsStore.getState()

const listed = (...shown: SavedPlaylist[]) =>
  usePlaylistsStore.setState({ playlists: shown, loadStatus: 'loaded' })

const scanned = (tracks: Track[]) =>
  useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks } })

/** What `check_playlist` answers when `missingCount` of the playlist's songs aren't found. */
const checkFinding = (playlist: SavedPlaylist, missingCount: number): PlaylistCheck => ({
  playlist: { ...playlist, allSongsFound: missingCount === 0 },
  missingCount
})

/** Answers `check_playlist` with `check`, and returns its spy. */
const mockCheck = (check: PlaylistCheck) => {
  const checkPlaylist = vi.fn((_args?: InvokeArgs) => check)
  mockCommands({ check_playlist: checkPlaylist })
  return checkPlaylist
}

describe('loadPlaylists', () => {
  it('lists the playlists sorted by title', async () => {
    mockCommands({ list_playlists: () => [roadTrip, calmEvening] })

    await playlists().loadPlaylists()

    expect(playlists()).toMatchObject({ playlists: [calmEvening, roadTrip], loadStatus: 'loaded' })
  })

  it("notifies when the Playlists folder can't be read", async () => {
    mockCommands({ list_playlists: failingCommand(LIST_ERROR) })

    await playlists().loadPlaylists()

    expect(playlists().loadStatus).toBe('failed')
    expect(shownNotifications()).toEqual([
      { type: 'error', title: "Couldn't load your playlists", description: LIST_ERROR }
    ])
  })
})

describe('showPlaylist', () => {
  it('opens a playlist and logs it by its title', () => {
    listed(roadTrip)

    playlists().showPlaylist(roadTrip.fileName)

    expect(playlists().shownPlaylist).toBe(roadTrip.fileName)
    expect(loggedMessages()).toEqual(['Opened playlist "Road trip"'])
  })

  it('keeps the playlist open while another page is on screen', () => {
    listed(roadTrip)
    playlists().showPlaylist(roadTrip.fileName)

    useNavigationStore.getState().selectCategory('settings')
    useNavigationStore.getState().selectCategory('playlists')

    expect(playlists().shownPlaylist).toBe(roadTrip.fileName)
  })
})

describe('showList', () => {
  it('goes back to the list of playlists', () => {
    listed(roadTrip)
    playlists().showPlaylist(roadTrip.fileName)

    playlists().showList()

    expect(playlists().shownPlaylist).toBeNull()
  })
})

describe('playPlaylist', () => {
  it('checks that its songs are in the Songs folder first', async () => {
    listed(roadTrip)
    scanned([blackened, makeBelieve, sadStatue])
    const checkPlaylist = mockCheck(checkFinding(roadTrip, 0))

    await playlists().playPlaylist(roadTrip.fileName)

    expect(checkPlaylist).toHaveBeenCalledWith({ fileName: roadTrip.fileName })
  })

  it("plays its songs in the playlist's order, from the first one", async () => {
    listed(roadTrip)
    scanned([blackened, reason, sadStatue, makeBelieve])
    mockCheck(checkFinding(roadTrip, 0))

    await playlists().playPlaylist(roadTrip.fileName)

    expect(usePlaybackStore.getState().session).toMatchObject({
      track: makeBelieve,
      queue: [makeBelieve, blackened, sadStatue],
      isPlaying: true
    })
  })

  it('starts from the song whose play was clicked', async () => {
    listed(roadTrip)
    scanned([blackened, makeBelieve, sadStatue])
    mockCheck(checkFinding(roadTrip, 0))

    await playlists().playPlaylist(roadTrip.fileName, 'Blackened.mp3')

    expect(usePlaybackStore.getState().session).toMatchObject({
      track: blackened,
      queue: [makeBelieve, blackened, sadStatue]
    })
  })

  it('skips the songs the last scan lacks', async () => {
    listed(roadTrip)
    scanned([sadStatue, makeBelieve])
    mockCheck(checkFinding(roadTrip, 0))

    await playlists().playPlaylist(roadTrip.fileName)

    expect(usePlaybackStore.getState().session?.queue).toEqual([makeBelieve, sadStatue])
  })

  it("plays nothing while songs are missing, and says how many aren't found", async () => {
    listed(roadTrip)
    scanned([blackened, makeBelieve, sadStatue])
    mockCheck(checkFinding(roadTrip, 2))

    await playlists().playPlaylist(roadTrip.fileName)

    expect(usePlaybackStore.getState().session).toBeNull()
    expect(playlists().playlists).toEqual([{ ...roadTrip, allSongsFound: false }])
    expect(shownNotifications()).toEqual([
      {
        type: 'error',
        title: `Couldn't play "Road trip"`,
        description: '2 songs are missing from the Songs folder.'
      }
    ])
  })

  it('says so when none of its songs is in the song list', async () => {
    listed(calmEvening)
    scanned([reason])
    mockCheck(checkFinding(calmEvening, 0))

    await playlists().playPlaylist(calmEvening.fileName)

    expect(usePlaybackStore.getState().session).toBeNull()
    expect(shownNotifications()).toEqual([
      {
        type: 'error',
        title: `Couldn't play "Calm evening"`,
        description: "Its songs aren't in the song list yet: scan the Songs folder again."
      }
    ])
  })

  it("notifies when the playlist can't be checked", async () => {
    listed(roadTrip)
    scanned([blackened, makeBelieve, sadStatue])
    mockCommands({ check_playlist: failingCommand(MISSING_ERROR) })

    await playlists().playPlaylist(roadTrip.fileName)

    expect(usePlaybackStore.getState().session).toBeNull()
    expect(shownNotifications()).toEqual([
      { type: 'error', title: `Couldn't play "Road trip"`, description: MISSING_ERROR }
    ])
  })
})

describe('recheckPlaylist', () => {
  it('turns its plays on again once every song is found', async () => {
    listed({ ...roadTrip, allSongsFound: false })
    mockCheck(checkFinding(roadTrip, 0))

    await playlists().recheckPlaylist(roadTrip.fileName)

    expect(playlists().playlists).toEqual([roadTrip])
    expect(shownNotifications()).toEqual([
      { type: 'success', title: 'Found every song of "Road trip"', description: undefined }
    ])
  })

  it('says how many songs are still missing', async () => {
    listed({ ...roadTrip, allSongsFound: false })
    mockCheck(checkFinding(roadTrip, 1))

    await playlists().recheckPlaylist(roadTrip.fileName)

    expect(playlists().playlists).toEqual([{ ...roadTrip, allSongsFound: false }])
    expect(shownNotifications()).toEqual([
      {
        type: 'error',
        title: `Couldn't find every song of "Road trip"`,
        description: '1 song is missing from the Songs folder.'
      }
    ])
  })

  it("notifies when the playlist can't be checked", async () => {
    listed({ ...roadTrip, allSongsFound: false })
    mockCommands({ check_playlist: failingCommand(MISSING_ERROR) })

    await playlists().recheckPlaylist(roadTrip.fileName)

    expect(shownNotifications()).toEqual([
      { type: 'error', title: `Couldn't check "Road trip"`, description: MISSING_ERROR }
    ])
  })
})

describe('deletePlaylist', () => {
  it('deletes its file and takes it off the list', async () => {
    listed(calmEvening, roadTrip)
    const deletePlaylist = vi.fn()
    mockCommands({ delete_playlist: deletePlaylist })

    await playlists().deletePlaylist(roadTrip.fileName)

    expect(deletePlaylist).toHaveBeenCalledWith({ fileName: roadTrip.fileName })
    expect(playlists().playlists).toEqual([calmEvening])
    expect(loggedMessages()).toEqual(['Deleted playlist "Road trip"'])
  })

  it('says it was deleted, with an Undo button', async () => {
    listed(roadTrip)
    mockCommands({ delete_playlist: () => undefined })

    await playlists().deletePlaylist(roadTrip.fileName)

    expect(shownNotifications()).toEqual([
      { type: 'info', title: '"Road trip" deleted', description: undefined, action: 'Undo' }
    ])
  })

  it("keeps the playlist when its file can't be deleted", async () => {
    listed(roadTrip)
    mockCommands({ delete_playlist: failingCommand(DELETE_ERROR) })

    await playlists().deletePlaylist(roadTrip.fileName)

    expect(playlists().playlists).toEqual([roadTrip])
    expect(shownNotifications()).toEqual([
      { type: 'error', title: `Couldn't delete "Road trip"`, description: DELETE_ERROR }
    ])
  })
})

describe('Undo of a deleted playlist', () => {
  it('writes its file again, under its old name and with its old contents', async () => {
    listed(calmEvening, roadTrip)
    const createPlaylist = vi.fn((_args?: InvokeArgs) => roadTrip)
    mockCommands({ delete_playlist: () => undefined, create_playlist: createPlaylist })
    await playlists().deletePlaylist(roadTrip.fileName)

    clickNotificationAction('"Road trip" deleted')

    await vi.waitFor(() => expect(playlists().playlists).toEqual([calmEvening, roadTrip]))
    expect(createPlaylist).toHaveBeenCalledWith({
      fileName: roadTrip.fileName,
      playlist: { title: roadTrip.title, description: roadTrip.description, songs: roadTrip.songs }
    })
    expect(loggedMessages()).toEqual([
      'Deleted playlist "Road trip"',
      'Restored playlist "Road trip"'
    ])
  })

  it("notifies when it can't be brought back", async () => {
    listed(roadTrip)
    mockCommands({
      delete_playlist: () => undefined,
      create_playlist: failingCommand(TAKEN_ERROR)
    })
    await playlists().deletePlaylist(roadTrip.fileName)

    clickNotificationAction('"Road trip" deleted')

    await vi.waitFor(() =>
      expect(shownNotifications()).toEqual([
        { type: 'error', title: `Couldn't restore "Road trip"`, description: TAKEN_ERROR }
      ])
    )
    expect(playlists().playlists).toEqual([])
  })
})
