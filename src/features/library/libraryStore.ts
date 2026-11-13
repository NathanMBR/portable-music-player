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
  scanLibrary: () => Promise<void>
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
  if (scan.kind !== 'loaded') return
  notifySuccess('Song list updated', `${formatSongCount(scan.tracks.length)} in the Songs folder`)
}

export const useLibraryStore = create<LibraryStore>()((set, get) => ({
  lastScan: null,
  isScanning: false,
  scanLibrary: async () => {
    if (get().isScanning) return

    // Only the scan at launch has no earlier result: every later one is a rescan, which notifies.
    const isRescan = get().lastScan !== null
    set({ isScanning: true })
    const lastScan = await scanSongsFolder()
    // The songs may have changed since the last scan, so their covers are read anew too.
    useCoverStore.getState().forgetCovers()
    set({ lastScan, isScanning: false })
    if (isRescan) notifyRescan(lastScan)
  },
  openFolder: async () => {
    try {
      await openSongsFolder()
    } catch (error) {
      notifyError("Couldn't open the Songs folder", error)
    }
  }
}))
