import { formatSongCount } from '../library/libraryStatus'
import { TITLE_ARTIST_SEPARATOR } from '../library/trackName'
import type { PlaylistsLoadStatus } from './playlistsStore'
import type { SavedPlaylist } from './types'

const formatPlaylistCount = (count: number) =>
  count === 1 ? '1 playlist' : `${count.toLocaleString()} playlists`

// Without playlists, the empty state or the failure notice below the status line says why.
export const describePlaylistsStatus = (loadStatus: PlaylistsLoadStatus, count: number) =>
  loadStatus === 'loaded' && count > 0 ? formatPlaylistCount(count) : ''

/** A playlist's status line: its song count, then its description when it has one. */
export const describePlaylist = ({ songs, description }: SavedPlaylist) => {
  const songCount = formatSongCount(songs.length)
  return description ? `${songCount}${TITLE_ARTIST_SEPARATOR}${description}` : songCount
}
