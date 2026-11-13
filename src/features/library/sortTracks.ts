import type { SongOrder } from '../settings/types'
import type { Track } from './types'

// A fixed locale keeps the order the same on every computer: with LANG=C, Linux webviews default
// to the POSIX collation, which puts every uppercase letter before any lowercase one.
const SORT_LOCALE = 'en'

// Ignores case and accents and compares numbers by value, so "Track 2" comes before "Track 10".
const collator = new Intl.Collator(SORT_LOCALE, { numeric: true, sensitivity: 'base' })

// The file's name without its folder or extension: with it, "Song 2.mp3" would come before
// "Song.mp3", since a space sorts before a dot.
const fileNameOf = ({ path }: Track) => {
  const fileName = path.slice(path.lastIndexOf('/') + 1)
  const extensionStart = fileName.lastIndexOf('.')
  return extensionStart > 0 ? fileName.slice(0, extensionStart) : fileName
}

const SORT_KEYS: Record<SongOrder, (track: Track) => string> = {
  fileName: fileNameOf,
  title: track => track.title
}

/** A sorted copy of the songs, in the order the settings ask for. */
export const sortTracks = (tracks: Track[], order: SongOrder) => {
  const sortKey = SORT_KEYS[order]
  return [...tracks].sort((first, second) => collator.compare(sortKey(first), sortKey(second)))
}
