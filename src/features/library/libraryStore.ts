import { create } from 'zustand'
import { notifyError, notifySuccess } from '../notifications/notify'
import { useCoverStore } from './coverStore'
import { loadMusicLibrary, openSongsFolder } from './libraryApi'
import { formatSongCount } from './libraryStatus'
import type { ScanOutcome } from './types'

type LibraryStore = {
  /** Kept while a new scan runs, so the list doesn't disappear during a rescan. */
  lastScan: ScanOutcome | null
  isScanning: boolean
  /** Scans the Songs folder, unless a scan already runs: a click while it does changes nothing. */
  scanLibrary: () => Promise<void>
  /**
   * Scans the Songs folder once any scan already running ends, for what changed since that one may
   * have listed the folder, like the songs of a drop just copied there.
   */
  scanAgain: () => Promise<void>
  openFolder: () => Promise<void>
}

const scanSongsFolder = async (): Promise<ScanOutcome> => {
  try {
    // Kept in the order Rust lists them: the Songs view sorts them as the settings ask.
    return { kind: 'loaded', tracks: await loadMusicLibrary() }
  } catch (error) {
    notifyError("Couldn't load your music", error)
    return { kind: 'failed' }
  }
}

const notifyRescan = (scan: ScanOutcome) => {
  if (scan.kind !== 'loaded') {
    return
  }
  notifySuccess('Song list updated', `${formatSongCount(scan.tracks.length)} in the Songs folder`)
}

export const useLibraryStore = create<LibraryStore>()((set, get) => {
  const untilScanEnds = () =>
    new Promise<void>(resolve => {
      if (!get().isScanning) {
        return resolve()
      }
      const stopWatching = useLibraryStore.subscribe(({ isScanning }) => {
        if (isScanning) {
          return
        }
        stopWatching()
        resolve()
      })
    })

  return {
    lastScan: null,
    isScanning: false,
    scanLibrary: async () => {
      if (get().isScanning) {
        return
      }

      // Only the scan at launch has no earlier result: every later one is a rescan, which notifies.
      const isRescan = get().lastScan !== null
      set({ isScanning: true })
      const lastScan = await scanSongsFolder()
      // The songs may have changed since the last scan, so their covers are read anew too.
      useCoverStore.getState().forgetCovers()
      set({ lastScan, isScanning: false })
      if (isRescan) {
        notifyRescan(lastScan)
      }
    },
    scanAgain: async () => {
      await untilScanEnds()
      await get().scanLibrary()
    },
    openFolder: async () => {
      try {
        await openSongsFolder()
      } catch (error) {
        notifyError("Couldn't open the Songs folder", error)
      }
    }
  }
})
