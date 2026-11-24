import { PlayIcon } from '@heroicons/react/20/solid'
import { AlertMark } from '../../../components/AlertMark/AlertMark'
import { IconButton } from '../../../components/IconButton/IconButton'
import { MISSING_SONGS_LABEL } from '../constants'
import { usePlaylistsStore } from '../playlistsStore'
import type { SavedPlaylist } from '../types'
import { useHasMissingSongs } from '../useHasMissingSongs'

type PlaylistPlayButtonProps = {
  /** The playlist the button plays. */
  playlist: SavedPlaylist
  /** The large filled disc of the playlist's page, rather than the round button of its row. */
  isLarge?: boolean
}

// The alert keeps the button's size, so what follows it stays in place once the songs are back.
const MissingSongsAlert = ({ isLarge }: { isLarge: boolean }) => (
  <span className={`flex shrink-0 items-center justify-center ${isLarge ? 'size-10' : 'size-9'}`}>
    <AlertMark label={MISSING_SONGS_LABEL} isLarge={isLarge} />
  </span>
)

/**
 * Button that plays a playlist from its first song, with its songs as the queue. Rust first looks
 * for them in the Songs folder: if some are missing, nothing plays and a notification says how
 * many, and the song list is scanned again when it said they were there. While the song list lacks
 * some of the playlist's songs, a red alert takes the button's place, the same size, until they're
 * found. It's disabled for a playlist without songs.
 *
 * @summary Button playing a playlist from its first song
 */
export const PlaylistPlayButton = ({ playlist, isLarge = false }: PlaylistPlayButtonProps) => {
  const playPlaylist = usePlaylistsStore(state => state.playPlaylist)
  const hasMissingSongs = useHasMissingSongs(playlist)

  if (hasMissingSongs) {
    return <MissingSongsAlert isLarge={isLarge} />
  }
  return (
    <IconButton
      icon={PlayIcon}
      label={`Play ${playlist.title}`}
      onClick={() => void playPlaylist(playlist.fileName)}
      shape={isLarge ? 'disc' : 'circle'}
      variant={isLarge ? 'filled' : 'quiet'}
      isDisabled={playlist.songs.length === 0}
    />
  )
}
