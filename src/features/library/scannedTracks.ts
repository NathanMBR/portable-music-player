import { useMemo } from 'react'
import { useSettingsStore } from '../settings/settingsStore'
import { useLibraryStore } from './libraryStore'
import { sortTracks } from './sortTracks'
import type { Track } from './types'

// The same empty list every time, so a selector doesn't make a new one at each render.
const NO_TRACKS: Track[] = []

/** The songs of the last scan, or none before it finishes or when it failed. */
export const useScannedTracks = () =>
  useLibraryStore(state => (state.lastScan?.kind === 'loaded' ? state.lastScan.tracks : NO_TRACKS))

/**
 * The songs, as the Songs view lists them: sorted at render rather than in the store, so a new
 * song order applies at once, and the settings restored after the first scan still sort its songs.
 */
export const useSortedTracks = (tracks: Track[]) => {
  const songOrder = useSettingsStore(state => state.settings.songOrder)
  return useMemo(() => sortTracks(tracks, songOrder), [tracks, songOrder])
}
