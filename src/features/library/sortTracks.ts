import { compareNames } from '../../compareNames'
import type { SongOrder } from '../settings/types'
import { fileNameOf, withoutExtension } from './trackName'
import type { Track } from './types'

const SORT_KEYS: Record<SongOrder, (track: Track) => string> = {
  // Without its extension: with it, "Song 2.mp3" would come before "Song.mp3", since a space sorts
  // before a dot.
  fileName: track => withoutExtension(fileNameOf(track)),
  title: track => track.title
}

/** A sorted copy of the songs, in the order the settings ask for. */
export const sortTracks = (tracks: Track[], order: SongOrder) => {
  const sortKey = SORT_KEYS[order]
  return [...tracks].sort((first, second) => compareNames(sortKey(first), sortKey(second)))
}
