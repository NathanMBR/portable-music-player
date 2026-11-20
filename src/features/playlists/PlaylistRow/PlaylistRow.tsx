import { EyeIcon, TrashIcon } from '@heroicons/react/20/solid'
import { AlertMark } from '../../../components/AlertMark/AlertMark'
import { IconButton } from '../../../components/IconButton/IconButton'
import { ListRow } from '../../../components/ListRow/ListRow'
import { TITLE_ARTIST_SEPARATOR } from '../../library/trackName'
import { MISSING_SONGS_LABEL, PLAYLISTS_ICON } from '../constants'
import { PlaylistPlayButton } from '../PlaylistPlayButton/PlaylistPlayButton'
import { usePlaylistsStore } from '../playlistsStore'
import { RecheckButton } from '../RecheckButton/RecheckButton'
import type { SavedPlaylist } from '../types'

type PlaylistRowProps = {
  /** The playlist the row shows. */
  playlist: SavedPlaylist
  /** Asks before the playlist is deleted, which its Delete button starts. */
  onDelete: () => void
}

const fullPlaylistName = ({ title, description }: SavedPlaylist) =>
  description ? `${title}${TITLE_ARTIST_SEPARATOR}${description}` : title

// Playlists have no cover, so the square where a song's cover goes shows the Playlists icon.
const PlaylistSquare = () => (
  <div className="flex size-9 shrink-0 items-center justify-center rounded bg-rule">
    <PLAYLISTS_ICON aria-hidden="true" className="size-5 text-ink-faded" />
  </div>
)

/**
 * Row of one playlist in the Playlists view, like a song's row: a round play button, a square with
 * the Playlists icon, then the playlist's title and, when it has one, a middle dot and its
 * description in a lighter ink. While its file says songs are missing, a red alert follows the
 * title, the play button is disabled and a Recheck button follows it. A name too long for the row
 * is cut with an ellipsis, and hovering shows it whole. At the row's right end, See opens the
 * playlist and Delete asks before deleting it.
 *
 * @summary Row of one playlist, with its play, See and Delete buttons
 */
export const PlaylistRow = ({ playlist, onDelete }: PlaylistRowProps) => {
  const showPlaylist = usePlaylistsStore(state => state.showPlaylist)

  return (
    <ListRow>
      <PlaylistPlayButton playlist={playlist} />
      <RecheckButton playlist={playlist} />
      <PlaylistSquare />
      <span
        title={fullPlaylistName(playlist)}
        className="flex min-w-0 flex-1 items-center gap-1.5 font-stretch-semi-condensed"
      >
        <span className="truncate">{playlist.title}</span>
        {!playlist.allSongsFound && <AlertMark label={MISSING_SONGS_LABEL} />}
        {playlist.description && (
          <span className="truncate text-ink-faded">
            {TITLE_ARTIST_SEPARATOR}
            {playlist.description}
          </span>
        )}
      </span>
      <IconButton
        icon={EyeIcon}
        label={`See ${playlist.title}`}
        onClick={() => showPlaylist(playlist.fileName)}
      />
      <IconButton icon={TrashIcon} label={`Delete ${playlist.title}`} onClick={onDelete} />
    </ListRow>
  )
}
