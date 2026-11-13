import { describe, expect, it, vi } from 'vitest'
import { failingCommand, mockCommands } from '../../testing/mockCommands'
import { shownNotifications } from '../../testing/notifications'
import { useCoverStore } from './coverStore'
import { useLibraryStore } from './libraryStore'
import type { ScanOutcome, Track } from './types'

const trackTitled = (title: string, artist: string): Track => ({
  path: `Songs/${title}.mp3`,
  title,
  artist
})

const READ_ERROR =
  "Couldn't read the Songs folder at /media/usb/Songs: Permission denied (os error 13)"

const scanLibrary = () => useLibraryStore.getState().scanLibrary()

describe('scanLibrary', () => {
  it('loads the songs from Rust in the order Rust lists them, for the Songs view to sort', async () => {
    const tracks = [
      trackTitled('Yesterday to Tomorrow', 'Audioslave'),
      trackTitled('Acid Rain', 'Angra')
    ]
    mockCommands({ load_music_library: () => tracks })

    await scanLibrary()

    expect(useLibraryStore.getState()).toMatchObject({
      isScanning: false,
      lastScan: { kind: 'loaded', tracks }
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
      tracks: [trackTitled('Generation Warriors', 'Angra')]
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

    answerScan([trackTitled('Silence and Distance', 'Angra')])
    await scan
    expect(useLibraryStore.getState()).toMatchObject({
      isScanning: false,
      lastScan: { kind: 'loaded', tracks: [trackTitled('Silence and Distance', 'Angra')] }
    })
  })

  it('forgets the covers once the scan is done, so each is read again from its song', async () => {
    const track = trackTitled('Winds of Destination', 'Angra')
    mockCommands({ load_music_library: () => [track] })
    useCoverStore.setState({ covers: new Map([[track.path, { kind: 'missing' }]]) })

    await scanLibrary()

    expect(useCoverStore.getState().covers.size).toBe(0)
  })

  it('notifies the song count when scanning again', async () => {
    useLibraryStore.setState({
      lastScan: { kind: 'loaded', tracks: [trackTitled('Metal Militia', 'Metallica')] }
    })
    mockCommands({
      load_music_library: () => [
        trackTitled('Metal Militia', 'Metallica'),
        trackTitled('Never Understand', 'Angra'),
        trackTitled('Cyclus Doloris', 'Angra')
      ]
    })

    await scanLibrary()

    expect(shownNotifications()).toEqual([
      { type: 'success', title: 'Song list updated', description: '3 songs in the Songs folder' }
    ])
  })

  it('notifies the songs found when scanning again after a failed scan', async () => {
    useLibraryStore.setState({ lastScan: { kind: 'failed' } })
    mockCommands({ load_music_library: () => [trackTitled('Know', 'System of a Down')] })

    await scanLibrary()

    expect(shownNotifications()).toEqual([
      { type: 'success', title: 'Song list updated', description: '1 song in the Songs folder' }
    ])
  })

  it('notifies nothing after the first scan, at launch', async () => {
    mockCommands({ load_music_library: () => [trackTitled('Deep Blue', 'Angra')] })

    await scanLibrary()

    expect(shownNotifications()).toEqual([])
  })

  it('notifies only the failure when scanning again fails', async () => {
    useLibraryStore.setState({
      lastScan: { kind: 'loaded', tracks: [trackTitled('Cochise', 'Audioslave')] }
    })
    mockCommands({ load_music_library: failingCommand(READ_ERROR) })

    await scanLibrary()

    expect(shownNotifications()).toEqual([
      { type: 'error', title: "Couldn't load your music", description: READ_ERROR }
    ])
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
