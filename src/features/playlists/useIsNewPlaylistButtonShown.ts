import { useNavigationStore } from '../navigation/navigationStore'
import { selectShownPlaylist, usePlaylistsStore } from './playlistsStore'

/** Whether the New playlist button is on screen: only while the list of playlists is. */
export const useIsNewPlaylistButtonShown = () => {
  const isOnPlaylists = useNavigationStore(state => state.currentCategory === 'playlists')
  const isListShown = usePlaylistsStore(state => selectShownPlaylist(state) === undefined)
  return isOnPlaylists && isListShown
}
