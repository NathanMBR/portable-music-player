import { describe, expect, it, vi } from 'vitest'
import { failingCommand, mockCommands } from '../../testing/mockCommands'
import { shownNotifications } from '../../testing/notifications'
import { useLibraryStore } from './libraryStore'
import type { ScanOutcome, Track } from './types'

const trackTitled = (title: string): Track => ({ path: `Songs/${title}.mp3`, title })

const READ_ERROR =
  "Couldn't read the Songs folder at /media/usb/Songs: Permission denied (os error 13)"

const scanLibrary = () => useLibraryStore.getState().scanLibrary()

describe('scanLibrary', () => {
  it('loads the songs from Rust, sorted by title', async () => {
    mockCommands({
      load_music_library: () => [
        trackTitled('Silence and Distance'),
        trackTitled('Generation Warriors')
      ]
    })

    await scanLibrary()

    expect(useLibraryStore.getState()).toMatchObject({
      isScanning: false,
      lastScan: {
        kind: 'loaded',
        tracks: [trackTitled('Generation Warriors'), trackTitled('Silence and Distance')]
      }
    })
  })

  it("turns a failed load into a failed scan and notifies Rust's message", async () => {
    mockCommands({ load_music_library: failingCommand(READ_ERROR) })

    await scanLibrary()

    expect(useLibraryStore.getState().lastScan).toEqual({ kind: 'failed' })
    expect(shownNotifications()).toEqual([
      { type: 'error', title: "Couldn't load your music", description: READ_ERROR }
    ])
  })

  it('keeps the previous result on screen while scanning again', async () => {
    const previousScan: ScanOutcome = {
      kind: 'loaded',
      tracks: [trackTitled('Generation Warriors')]
    }
    useLibraryStore.setState({ lastScan: previousScan })
    let answerScan: (tracks: Track[]) => void = () => undefined
    mockCommands({
      load_music_library: () =>
        new Promise<Track[]>(resolve => {
          answerScan = resolve
        })
    })

    const scan = scanLibrary()
    expect(useLibraryStore.getState()).toMatchObject({ isScanning: true, lastScan: previousScan })

    answerScan([trackTitled('Silence and Distance')])
    await scan
    expect(useLibraryStore.getState()).toMatchObject({
      isScanning: false,
      lastScan: { kind: 'loaded', tracks: [trackTitled('Silence and Distance')] }
    })
  })

  it('ignores a scan requested while one is running', async () => {
    const loadMusicLibrary = vi.fn(() => [])
    mockCommands({ load_music_library: loadMusicLibrary })

    await Promise.all([scanLibrary(), scanLibrary()])

    expect(loadMusicLibrary).toHaveBeenCalledOnce()
  })
})

describe('openFolder', () => {
  it('asks Rust to open the Songs folder', async () => {
    const openSongsFolder = vi.fn()
    mockCommands({ open_songs_folder: openSongsFolder })

    await useLibraryStore.getState().openFolder()

    expect(openSongsFolder).toHaveBeenCalledOnce()
    expect(shownNotifications()).toEqual([])
  })

  it("notifies why the Songs folder couldn't be opened", async () => {
    const openError = "Couldn't open the Songs folder: no application can open folders"
    mockCommands({ open_songs_folder: failingCommand(openError) })

    await useLibraryStore.getState().openFolder()

    expect(shownNotifications()).toEqual([
      { type: 'error', title: "Couldn't open the Songs folder", description: openError }
    ])
  })
})
