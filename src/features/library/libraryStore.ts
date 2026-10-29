import { create } from 'zustand'
import { notifyError } from '../notifications/notify'
import { loadMusicLibrary, openSongsFolder } from './libraryApi'
import { sortTracksByTitle } from './sortTracks'
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
    const tracks = await loadMusicLibrary()
    return { kind: 'loaded', tracks: sortTracksByTitle(tracks) }
  } catch (error) {
    notifyError("Couldn't load your music", error)
    return { kind: 'failed' }
  }
}

export const useLibraryStore = create<LibraryStore>()((set, get) => ({
  lastScan: null,
  isScanning: false,
  scanLibrary: async () => {
    if (get().isScanning) return

    set({ isScanning: true })
    set({ lastScan: await scanSongsFolder(), isScanning: false })
  },
  openFolder: async () => {
    try {
      await openSongsFolder()
    } catch (error) {
      notifyError("Couldn't open the Songs folder", error)
    }
  }
}))
