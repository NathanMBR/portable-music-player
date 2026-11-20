import { PlaylistPage } from '../PlaylistPage/PlaylistPage'
import { PlaylistsOverview } from '../PlaylistsOverview/PlaylistsOverview'
import { usePlaylistsStore } from '../playlistsStore'

/**
 * The Playlists category: the list of playlists, or the playlist opened from it with See, until
 * its back button goes back to the list. The playlist stays open while other pages are on screen,
 * so coming back shows it again.
 *
 * @summary Playlists category view
 */
export const PlaylistsView = () => {
  const shownPlaylist = usePlaylistsStore(state =>
    state.playlists.find(playlist => playlist.fileName === state.shownPlaylist)
  )

  return shownPlaylist ? <PlaylistPage playlist={shownPlaylist} /> : <PlaylistsOverview />
}
