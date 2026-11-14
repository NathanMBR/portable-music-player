import type { InvokeArgs } from '@tauri-apps/api/core'
import { describe, expect, it, vi } from 'vitest'
import { loggedMessages } from '../../testing/logs'
import { failingCommand, mockCommands } from '../../testing/mockCommands'
import { shownNotifications } from '../../testing/notifications'
import { useLibraryStore } from '../library/libraryStore'
import type { Track } from '../library/types'
import { useSongDropStore } from './songDropStore'
import type { CopyOutcome, DroppedSongs } from './types'

const pride: Track = { path: 'Songs/Pride.mp3', title: 'Pride', artist: 'Shaman' }
const wutheringHeights: Track = {
  path: 'Songs/Wuthering Heights.mp3',
  title: 'Wuthering Heights',
  artist: 'Angra'
}
const oneAndTheSame: Track = {
  path: 'Songs/One and the Same.mp3',
  title: 'One and the Same',
  artist: 'Audioslave'
}
const thornWithin: Track = {
  path: 'Songs/Thorn Within.mp3',
  title: 'Thorn Within',
  artist: 'Metallica'
}

const DROPPED_PATHS = [
  '/home/user/Music/Wuthering Heights.mp3',
  '/home/user/Music/Audioslave',
  '/home/user/Music/Thorn Within.mp3'
]

const NOTHING_TAKEN: DroppedSongs = { songCount: 3, conflicts: [], failures: [] }
const ONE_NAME_TAKEN: DroppedSongs = { songCount: 3, conflicts: ['Thorn Within.mp3'], failures: [] }
const ALL_COPIED: CopyOutcome = { copiedCount: 3, failures: [] }

const songDrop = () => useSongDropStore.getState()

type DropMocks = {
  droppedSongs: DroppedSongs
  outcome?: CopyOutcome | Promise<CopyOutcome>
  tracks?: Track[] | Promise<Track[]>
}

/** Answers the drop's commands and the rescan, and returns the copy command's spy. */
const mockDrop = ({ droppedSongs, outcome = ALL_COPIED, tracks = [] }: DropMocks) => {
  const copyDroppedSongs = vi.fn((_args?: InvokeArgs) => outcome)
  mockCommands({
    check_dropped_songs: () => droppedSongs,
    copy_dropped_songs: copyDroppedSongs,
    load_music_library: () => tracks
  })
  return copyDroppedSongs
}

/** A promise answered later, by `answer`, to see what happens while a command runs. */
const pending = <Value>() => {
  let answer: (value: Value) => void = () => undefined
  const promise = new Promise<Value>(resolve => {
    answer = resolve
  })
  return { promise, answer }
}

/** The library as the launch scan left it, so the scan after a drop is a rescan. */
const scannedAtLaunch = () =>
  useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: [pride] } })

describe('dropSongs', () => {
  it('copies the songs at once when no file name is taken, then scans the Songs folder again', async () => {
    scannedAtLaunch()
    const tracks = [pride, wutheringHeights, oneAndTheSame, thornWithin]
    const copyDroppedSongs = mockDrop({ droppedSongs: NOTHING_TAKEN, tracks })

    await songDrop().dropSongs(DROPPED_PATHS)

    expect(copyDroppedSongs).toHaveBeenCalledExactlyOnceWith({
      paths: DROPPED_PATHS,
      onConflict: 'skip'
    })
    expect(songDrop().step).toEqual({ kind: 'idle' })
    expect(useLibraryStore.getState().lastScan).toEqual({ kind: 'loaded', tracks })
    expect(shownNotifications()).toEqual([
      { type: 'success', title: 'Song list updated', description: '4 songs in the Songs folder' }
    ])
  })

  it('logs the songs found in the drop and the songs copied', async () => {
    mockDrop({ droppedSongs: NOTHING_TAKEN, outcome: { copiedCount: 3, failures: [] } })

    await songDrop().dropSongs(DROPPED_PATHS)

    expect(loggedMessages()).toEqual(['Dropped 3 songs', 'Copied 3 songs to the Songs folder'])
  })

  it('looks for the songs before anything else, in the checking step', async () => {
    const check = pending<DroppedSongs>()
    mockCommands({ check_dropped_songs: () => check.promise })

    void songDrop().dropSongs(DROPPED_PATHS)

    expect(songDrop().step).toEqual({ kind: 'checking' })
    check.answer({ songCount: 0, conflicts: [], failures: [] })
    await vi.waitFor(() => expect(songDrop().step).toEqual({ kind: 'idle' }))
  })

  it('asks before copying anything when file names are taken', async () => {
    const copyDroppedSongs = mockDrop({ droppedSongs: ONE_NAME_TAKEN })

    await songDrop().dropSongs(DROPPED_PATHS)

    expect(songDrop().step).toEqual({
      kind: 'asking',
      paths: DROPPED_PATHS,
      droppedSongs: ONE_NAME_TAKEN
    })
    expect(copyDroppedSongs).not.toHaveBeenCalled()
  })

  it('tells when the drop holds no songs, copying and scanning nothing', async () => {
    scannedAtLaunch()
    const copyDroppedSongs = mockDrop({
      droppedSongs: { songCount: 0, conflicts: [], failures: [] }
    })

    await songDrop().dropSongs(['/home/user/Music/cover.jpg'])

    expect(copyDroppedSongs).not.toHaveBeenCalled()
    expect(songDrop().step).toEqual({ kind: 'idle' })
    expect(shownNotifications()).toEqual([
      {
        type: 'info',
        title: 'No songs to add',
        description: 'Only MP3 files can be added to the Songs folder'
      }
    ])
    expect(loggedMessages()).toEqual(['Dropped 0 songs'])
  })

  it("notifies why a drop with no songs couldn't be read", async () => {
    const failure = {
      path: '/home/user/Music/Angra',
      reason: 'Permission denied (os error 13)'
    }
    mockDrop({ droppedSongs: { songCount: 0, conflicts: [], failures: [failure] } })

    await songDrop().dropSongs(['/home/user/Music/Angra'])

    expect(shownNotifications()).toEqual([
      {
        type: 'error',
        title: "Couldn't add the dropped songs",
        description: '/home/user/Music/Angra: Permission denied (os error 13)'
      }
    ])
  })

  it("notifies Rust's message when the drop can't be checked", async () => {
    const rootError =
      "Couldn't find the folder the player is running from: No such file or directory"
    mockCommands({ check_dropped_songs: failingCommand(rootError) })

    await songDrop().dropSongs(DROPPED_PATHS)

    expect(songDrop().step).toEqual({ kind: 'idle' })
    expect(shownNotifications()).toEqual([
      { type: 'error', title: "Couldn't add the dropped songs", description: rootError }
    ])
  })

  it('ignores a drop while the songs of another are being added', async () => {
    const checkDroppedSongs = vi.fn()
    mockCommands({ check_dropped_songs: checkDroppedSongs })
    useSongDropStore.setState({ step: { kind: 'copying', songCount: 2 } })

    await songDrop().dropSongs(DROPPED_PATHS)

    expect(checkDroppedSongs).not.toHaveBeenCalled()
    expect(songDrop().step).toEqual({ kind: 'copying', songCount: 2 })
  })
})

describe('adding the songs', () => {
  it('shows how many songs it copies while copying them', async () => {
    const copy = pending<CopyOutcome>()
    mockDrop({ droppedSongs: NOTHING_TAKEN, outcome: copy.promise })

    const drop = songDrop().dropSongs(DROPPED_PATHS)

    await vi.waitFor(() => expect(songDrop().step).toEqual({ kind: 'copying', songCount: 3 }))
    copy.answer(ALL_COPIED)
    await drop
  })

  it('keeps the copying step until the song list is scanned again', async () => {
    const scan = pending<Track[]>()
    mockDrop({ droppedSongs: NOTHING_TAKEN, tracks: scan.promise })

    const drop = songDrop().dropSongs(DROPPED_PATHS)

    await vi.waitFor(() => expect(useLibraryStore.getState().isScanning).toBe(true))
    expect(songDrop().step).toEqual({ kind: 'copying', songCount: 3 })
    scan.answer([wutheringHeights])
    await drop
    expect(songDrop().step).toEqual({ kind: 'idle' })
  })

  it('waits for a scan already running before scanning again, since it may miss the new songs', async () => {
    const loadMusicLibrary = vi.fn(() => [wutheringHeights])
    mockCommands({
      check_dropped_songs: () => NOTHING_TAKEN,
      copy_dropped_songs: () => ALL_COPIED,
      load_music_library: loadMusicLibrary
    })
    useLibraryStore.setState({ isScanning: true })

    const drop = songDrop().dropSongs(DROPPED_PATHS)

    await vi.waitFor(() => expect(loggedMessages()).toContain('Copied 3 songs to the Songs folder'))
    expect(loadMusicLibrary).not.toHaveBeenCalled()
    useLibraryStore.setState({ isScanning: false })
    await drop
    expect(loadMusicLibrary).toHaveBeenCalledOnce()
  })

  it("notifies the files it couldn't copy, and still scans the Songs folder again", async () => {
    scannedAtLaunch()
    const outcome: CopyOutcome = {
      copiedCount: 1,
      failures: [
        { path: '/home/user/Music/I Love You.mp3', reason: 'Permission denied (os error 13)' },
        { path: '/home/user/Music/Carpe Diem Baby.mp3', reason: 'No space left on device' },
        { path: '/home/user/Music/Sprouts of Time.mp3', reason: 'No space left on device' }
      ]
    }
    mockDrop({ droppedSongs: NOTHING_TAKEN, outcome, tracks: [pride, wutheringHeights] })

    await songDrop().dropSongs(DROPPED_PATHS)

    expect(shownNotifications()).toContainEqual({
      type: 'error',
      title: "Couldn't add some of the dropped files",
      description: '/home/user/Music/I Love You.mp3: Permission denied (os error 13), and 2 more'
    })
    expect(shownNotifications()).toContainEqual({
      type: 'success',
      title: 'Song list updated',
      description: '2 songs in the Songs folder'
    })
  })

  it("notifies Rust's message when the songs can't be copied at all, and scans nothing", async () => {
    const folderError =
      "Couldn't create the Songs folder at /media/usb/Songs: Read-only file system (os error 30)"
    const loadMusicLibrary = vi.fn(() => [])
    mockCommands({
      check_dropped_songs: () => NOTHING_TAKEN,
      copy_dropped_songs: failingCommand(folderError),
      load_music_library: loadMusicLibrary
    })

    await songDrop().dropSongs(DROPPED_PATHS)

    expect(songDrop().step).toEqual({ kind: 'idle' })
    expect(loadMusicLibrary).not.toHaveBeenCalled()
    expect(shownNotifications()).toEqual([
      { type: 'error', title: "Couldn't add the dropped songs", description: folderError }
    ])
  })
})

describe('copyTakenNames', () => {
  it('copies the drop, skipping the songs whose name is taken, when told to skip', async () => {
    const copyDroppedSongs = mockDrop({ droppedSongs: ONE_NAME_TAKEN })
    await songDrop().dropSongs(DROPPED_PATHS)

    await songDrop().copyTakenNames('skip')

    expect(copyDroppedSongs).toHaveBeenCalledExactlyOnceWith({
      paths: DROPPED_PATHS,
      onConflict: 'skip'
    })
    expect(songDrop().step).toEqual({ kind: 'idle' })
  })

  it('copies the drop, replacing the songs whose name is taken, when told to replace', async () => {
    const copyDroppedSongs = mockDrop({ droppedSongs: ONE_NAME_TAKEN })
    await songDrop().dropSongs(DROPPED_PATHS)

    await songDrop().copyTakenNames('replace')

    expect(copyDroppedSongs).toHaveBeenCalledExactlyOnceWith({
      paths: DROPPED_PATHS,
      onConflict: 'replace'
    })
  })

  it('counts only the songs it copies: the skipped ones are left out', async () => {
    const copy = pending<CopyOutcome>()
    mockDrop({ droppedSongs: ONE_NAME_TAKEN, outcome: copy.promise })
    await songDrop().dropSongs(DROPPED_PATHS)

    const adding = songDrop().copyTakenNames('skip')

    expect(songDrop().step).toEqual({ kind: 'copying', songCount: 2 })
    copy.answer({ copiedCount: 2, failures: [] })
    await adding
  })

  it('counts every song when replacing', async () => {
    const copy = pending<CopyOutcome>()
    mockDrop({ droppedSongs: ONE_NAME_TAKEN, outcome: copy.promise })
    await songDrop().dropSongs(DROPPED_PATHS)

    const adding = songDrop().copyTakenNames('replace')

    expect(songDrop().step).toEqual({ kind: 'copying', songCount: 3 })
    copy.answer(ALL_COPIED)
    await adding
  })
})

describe('cancel', () => {
  it('drops the songs without copying anything', async () => {
    const copyDroppedSongs = mockDrop({ droppedSongs: ONE_NAME_TAKEN })
    await songDrop().dropSongs(DROPPED_PATHS)

    songDrop().cancel()

    expect(songDrop().step).toEqual({ kind: 'idle' })
    expect(copyDroppedSongs).not.toHaveBeenCalled()
  })

  it("can't stop songs already being copied", () => {
    useSongDropStore.setState({ step: { kind: 'copying', songCount: 3 } })

    songDrop().cancel()

    expect(songDrop().step).toEqual({ kind: 'copying', songCount: 3 })
  })
})

describe('setDragging', () => {
  it('keeps whether files are dragged over the window', () => {
    songDrop().setDragging(true)
    expect(songDrop().isDragging).toBe(true)

    songDrop().setDragging(false)
    expect(songDrop().isDragging).toBe(false)
  })
})
