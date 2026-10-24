import { create } from 'zustand'
import { loadMusicLibrary } from './libraryApi'
import { sortTracksByTitle } from './sortTracks'
import type { ScanOutcome } from './types'

type LibraryStore = {
  /** Kept while a new scan runs, so the list doesn't disappear during a rescan. */
  lastScan: ScanOutcome | null
  isScanning: boolean
  scanLibrary: () => Promise<void>
}

const scanSongsFolder = async (): Promise<ScanOutcome> => {
  try {
    const tracks = await loadMusicLibrary()
    return { kind: 'loaded', tracks: sortTracksByTitle(tracks) }
  } catch (error) {
    return { kind: 'failed', message: String(error) }
  }
}

export const useLibraryStore = create<LibraryStore>()((set, get) => ({
  lastScan: null,
  isScanning: false,
  scanLibrary: async () => {
    if (get().isScanning) return

    set({ isScanning: true })
    set({ lastScan: await scanSongsFolder(), isScanning: false })
  }
}))
