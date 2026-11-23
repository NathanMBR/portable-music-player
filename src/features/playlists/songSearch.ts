import { fileNameOf } from '../library/trackName'
import type { Track } from '../library/types'
import { withoutAccents } from './plainText'
import type { PlaylistSong } from './playlistSongs'

// Uppercase and accents count as their plain form, on both sides of the search.
const foldForSearch = (text: string) => withoutAccents(text).toLowerCase()

/** Whether the song's title, artist or file name holds the search; a blank search finds them all. */
export const matchesSearch = (track: Track, search: string) => {
  const query = foldForSearch(search.trim())
  return [track.title, track.artist ?? '', fileNameOf(track)].some(field =>
    foldForSearch(field).includes(query)
  )
}

/**
 * Whether a song of a playlist, at its position from 1, matches the search: its position whole,
 * so 1 finds the first song and not the twelfth, or a part of its title, artist or file name, as
 * `matchesSearch`. A song the last scan lacks has only its file name to match.
 */
export const matchesPlaylistSearch = (song: PlaylistSong, position: number, search: string) => {
  if (search.trim() === String(position)) {
    return true
  }
  return song.track
    ? matchesSearch(song.track, search)
    : foldForSearch(song.fileName).includes(foldForSearch(search.trim()))
}
