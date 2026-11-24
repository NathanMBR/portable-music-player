import { useLibraryStore } from '../library/libraryStore'
import { hasMissingSongs } from './playlistSongs'
import type { SavedPlaylist } from './types'

/**
 * Whether some of the playlist's songs are missing from the Songs folder, from the last scan, so it
 * changes with the song list, in every place at once.
 */
export const useHasMissingSongs = (playlist: SavedPlaylist) =>
  useLibraryStore(state => hasMissingSongs(playlist, state.lastScan))
