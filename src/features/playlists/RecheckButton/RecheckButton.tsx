import { ArrowPathIcon } from '@heroicons/react/20/solid'
import { IconButton } from '../../../components/IconButton/IconButton'
import { usePlaylistsStore } from '../playlistsStore'
import type { SavedPlaylist } from '../types'
import { useHasMissingSongs } from '../useHasMissingSongs'

type RecheckButtonProps = {
  /** The playlist whose songs it looks for. */
  playlist: SavedPlaylist
}

/**
 * Button that looks for a playlist's songs in the Songs folder again, shown only while the song
 * list lacks some, as after they were moved away. When Rust finds other songs than the song list
 * holds, the song list is scanned again, so the songs show or go everywhere at once. Once every
 * song is back, a notification says so, and the playlist's plays turn on again; otherwise one says
 * how many are still missing.
 *
 * @summary Button looking again for a playlist's missing songs
 */
export const RecheckButton = ({ playlist }: RecheckButtonProps) => {
  const recheckPlaylist = usePlaylistsStore(state => state.recheckPlaylist)
  const hasMissingSongs = useHasMissingSongs(playlist)

  if (!hasMissingSongs) {
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
