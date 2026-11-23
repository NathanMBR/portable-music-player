import { Button } from '@headlessui/react'
import { PencilIcon, TrashIcon } from '@heroicons/react/20/solid'
import type { ReactNode } from 'react'
import { ActionMenu } from '../../../components/ActionMenu/ActionMenu'
import { AlertMark } from '../../../components/AlertMark/AlertMark'
import { STRETCHED_FOCUS_CLASSES } from '../../../components/buttonStyles'
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
  /** Opens the playlist's dialog to edit it, which Edit playlist, in its menu, starts. */
  onEdit: () => void
  /** Asks before the playlist is deleted, which Delete playlist, in its menu, starts. */
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

// The title's button covers the whole row, so the row's other controls sit above it.
const RaisedControls = ({ children }: { children: ReactNode }) => (
  <div className="relative z-10 flex shrink-0 items-center gap-2">{children}</div>
)

/**
 * Row of one playlist in the Playlists view, like a song's row: a round play button, a square with
 * the Playlists icon, then the playlist's title and, when it has one, a middle dot and its
 * description in a lighter ink. While its file says songs are missing, a red alert follows the
 * title, the play button is disabled and a Recheck button follows it. A name too long for the row
 * is cut with an ellipsis, and hovering shows it whole. A click anywhere on the row outside its
 * buttons opens the playlist, under a pointer cursor, and so does Enter on its title from the
 * keyboard, whose focus ring goes around the row. At the row's right end, a menu holds Edit
 * playlist, which opens its dialog, and Delete playlist, which asks before deleting it.
 *
 * @summary Row of one playlist, opening it, with its play button and a menu to edit or delete it
 */
export const PlaylistRow = ({ playlist, onEdit, onDelete }: PlaylistRowProps) => {
  const showPlaylist = usePlaylistsStore(state => state.showPlaylist)

  return (
    <ListRow>
      <RaisedControls>
        <PlaylistPlayButton playlist={playlist} />
        <RecheckButton playlist={playlist} />
      </RaisedControls>
      <PlaylistSquare />
      <span className="flex min-w-0 flex-1 items-center gap-1.5 font-stretch-semi-condensed">
        <Button
          aria-label={`See ${playlist.title}`}
          title={fullPlaylistName(playlist)}
          onClick={() => showPlaylist(playlist.fileName)}
          className={`min-w-0 truncate text-left after:absolute after:inset-0 ${STRETCHED_FOCUS_CLASSES}`}
        >
          {playlist.title}
        </Button>
        {!playlist.allSongsFound && <AlertMark label={MISSING_SONGS_LABEL} />}
        {playlist.description && (
          <span className="truncate text-ink-faded">
            {TITLE_ARTIST_SEPARATOR}
            {playlist.description}
          </span>
        )}
      </span>
      <RaisedControls>
        <ActionMenu
          label={`More for ${playlist.title}`}
          items={[
            { label: 'Edit playlist', icon: PencilIcon, onClick: onEdit },
            { label: 'Delete playlist', icon: TrashIcon, onClick: onDelete }
          ]}
        />
      </RaisedControls>
    </ListRow>
  )
}
