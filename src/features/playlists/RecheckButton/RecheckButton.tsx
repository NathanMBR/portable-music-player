import { ArrowPathIcon } from '@heroicons/react/20/solid'
import { IconButton } from '../../../components/IconButton/IconButton'
import { usePlaylistsStore } from '../playlistsStore'
import type { SavedPlaylist } from '../types'

type RecheckButtonProps = {
  /** The playlist whose songs it looks for. */
  playlist: SavedPlaylist
}

/**
 * Button that looks for a playlist's songs in the Songs folder again, shown only while its file
 * says some are missing, as after they were moved away. Once every song is back, a notification
 * says so, and the playlist's plays turn on again; otherwise one says how many are still missing.
 *
 * @summary Button looking again for a playlist's missing songs
 */
export const RecheckButton = ({ playlist }: RecheckButtonProps) => {
  const recheckPlaylist = usePlaylistsStore(state => state.recheckPlaylist)

  if (playlist.allSongsFound) {
    return null
  }
  return (
    <IconButton
      icon={ArrowPathIcon}
      label={`Recheck ${playlist.title}`}
      onClick={() => void recheckPlaylist(playlist.fileName)}
    />
  )
}
