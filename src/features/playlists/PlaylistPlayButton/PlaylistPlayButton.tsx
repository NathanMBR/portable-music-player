import { PlayIcon } from '@heroicons/react/20/solid'
import { IconButton } from '../../../components/IconButton/IconButton'
import { usePlaylistsStore } from '../playlistsStore'
import type { SavedPlaylist } from '../types'

type PlaylistPlayButtonProps = {
  /** The playlist the button plays. */
  playlist: SavedPlaylist
  /** The large filled disc of the playlist's page, rather than the round button of its row. */
  isLarge?: boolean
}

/**
 * Button that plays a playlist from its first song, with its songs as the queue. Rust first looks
 * for them in the Songs folder: if some are missing, nothing plays and a notification says how
 * many. It's disabled while the playlist's file says songs are missing, until a recheck finds
 * them, and for a playlist without songs.
 *
 * @summary Button playing a playlist from its first song
 */
export const PlaylistPlayButton = ({ playlist, isLarge = false }: PlaylistPlayButtonProps) => {
  const playPlaylist = usePlaylistsStore(state => state.playPlaylist)

  return (
    <IconButton
      icon={PlayIcon}
      label={`Play ${playlist.title}`}
      onClick={() => void playPlaylist(playlist.fileName)}
      shape={isLarge ? 'disc' : 'circle'}
      variant={isLarge ? 'filled' : 'quiet'}
      isDisabled={!playlist.allSongsFound || playlist.songs.length === 0}
    />
  )
}
