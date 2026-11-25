import { Button } from '@headlessui/react'
import { ArrowPathIcon, PencilIcon, TrashIcon } from '@heroicons/react/20/solid'
import { type ReactNode, useMemo } from 'react'
import { ActionMenu } from '../../../components/ActionMenu/ActionMenu'
import { STRETCHED_FOCUS_CLASSES } from '../../../components/buttonStyles'
import { ListRow } from '../../../components/ListRow/ListRow'
import { CoverThumbnail } from '../../library/CoverThumbnail/CoverThumbnail'
import { useScannedTracks } from '../../library/scannedTracks'
import { TITLE_ARTIST_SEPARATOR } from '../../library/trackName'
import { PLAYLISTS_ICON } from '../constants'
import { PlaylistPlayButton } from '../PlaylistPlayButton/PlaylistPlayButton'
import { foundPathsOf } from '../playlistSongs'
import { usePlaylistsStore } from '../playlistsStore'
import type { SavedPlaylist } from '../types'
import { useHasMissingSongs } from '../useHasMissingSongs'

type PlaylistRowProps = {
  /** The playlist the row shows. */
  playlist: SavedPlaylist
  /** Opens the playlist's dialog to edit it, which Edit playlist, in its menu, starts. */
  onEdit: () => void
  /** Asks before the playlist is deleted, which Delete playlist, in its menu, starts. */
  onDelete: () => void
}

// Recheck songs shows only while songs are missing, first, as what the alert calls for.
const useMenuItems = ({ playlist, onEdit, onDelete }: PlaylistRowProps) => {
  const recheckPlaylist = usePlaylistsStore(state => state.recheckPlaylist)
  const hasMissingSongs = useHasMissingSongs(playlist)
  const recheck = {
    label: 'Recheck songs',
    icon: ArrowPathIcon,
    onClick: () => void recheckPlaylist(playlist.fileName)
  }
  return [
    ...(hasMissingSongs ? [recheck] : []),
    { label: 'Edit playlist', icon: PencilIcon, onClick: onEdit },
    { label: 'Delete playlist', icon: TrashIcon, onClick: onDelete }
  ]
}

const fullPlaylistName = ({ title, description }: SavedPlaylist) =>
  description ? `${title}${TITLE_ARTIST_SEPARATOR}${description}` : title

// Playlists have no cover of their own, so the square shows the first cover among the songs the
// last scan found, in the playlist's order, or the Playlists icon when none has one.
const PlaylistCover = ({ playlist }: { playlist: SavedPlaylist }) => {
  const tracks = useScannedTracks()
  const paths = useMemo(() => foundPathsOf(playlist.songs, tracks), [playlist.songs, tracks])
  return <CoverThumbnail paths={paths} placeholderIcon={PLAYLISTS_ICON} />
}

// The title's button covers the whole row, so the row's other controls sit above it.
const RaisedControls = ({ children }: { children: ReactNode }) => (
  <div className="relative z-10 flex shrink-0 items-center gap-2">{children}</div>
)

/**
 * Row of one playlist in the Playlists view, like a song's row: a round play button, a square with
 * the cover of its first song that has one, or the Playlists icon when none does, then the
 * playlist's title and, when it has one, a middle dot and its description in a lighter ink. While
 * the song list lacks some of its songs, a red alert takes the play button's place. A name too long
 * for the row is cut with an ellipsis, and hovering shows it whole. A click anywhere on the row
 * outside its controls opens the playlist, under a pointer cursor, and so does Enter on its title
 * from the keyboard, whose focus ring goes around the row. At the row's right end, a menu holds
 * Recheck songs while songs are missing, which looks for them again, then Edit playlist, which
 * opens its dialog, and Delete playlist, which asks before deleting it.
 *
 * @summary Row of one playlist, opening it, with its play button and a menu to edit or delete it
 */
export const PlaylistRow = ({ playlist, onEdit, onDelete }: PlaylistRowProps) => {
  const showPlaylist = usePlaylistsStore(state => state.showPlaylist)
  const menuItems = useMenuItems({ playlist, onEdit, onDelete })

  return (
    <ListRow>
      <RaisedControls>
        <PlaylistPlayButton playlist={playlist} />
      </RaisedControls>
      <PlaylistCover playlist={playlist} />
      <span className="flex min-w-0 flex-1 items-center gap-1.5 font-stretch-semi-condensed">
        <Button
          aria-label={`See ${playlist.title}`}
          title={fullPlaylistName(playlist)}
          onClick={() => showPlaylist(playlist.fileName)}
          className={`min-w-0 truncate text-left after:absolute after:inset-0 ${STRETCHED_FOCUS_CLASSES}`}
        >
          {playlist.title}
        </Button>
        {playlist.description && (
          <span className="truncate text-ink-faded">
            {TITLE_ARTIST_SEPARATOR}
            {playlist.description}
          </span>
        )}
      </span>
      <RaisedControls>
        <ActionMenu label={`More for ${playlist.title}`} items={menuItems} />
      </RaisedControls>
    </ListRow>
  )
}
