import { fileNameOf } from '../library/trackName'
import type { Track } from '../library/types'
import { withoutAccents } from './plainText'

// Uppercase and accents count as their plain form, on both sides of the search.
const foldForSearch = (text: string) => withoutAccents(text).toLowerCase()

/** Whether the song's title, artist or file name holds the search; a blank search finds them all. */
export const matchesSearch = (track: Track, search: string) => {
  const query = foldForSearch(search.trim())
  return [track.title, track.artist ?? '', fileNameOf(track)].some(field =>
    foldForSearch(field).includes(query)
  )
}
