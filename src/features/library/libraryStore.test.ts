import { describe, expect, it, vi } from 'vitest'
import { failingCommand, mockCommands } from '../../testing/mockCommands'
import { useLibraryStore } from './libraryStore'
import type { ScanOutcome, Track } from './types'

const trackTitled = (title: string): Track => ({ path: `Songs/${title}.mp3`, title })

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

  it("turns a failed load into a failed scan with Rust's message", async () => {
    mockCommands({ load_music_library: failingCommand("Couldn't read the Songs folder") })

    await scanLibrary()

    expect(useLibraryStore.getState().lastScan).toEqual({
      kind: 'failed',
      message: "Couldn't read the Songs folder"
    })
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
