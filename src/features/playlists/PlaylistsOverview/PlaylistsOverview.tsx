import { Button } from '../../../components/Button/Button'
import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog'
import { EmptyState } from '../../../components/EmptyState/EmptyState'
import { Notice } from '../../../components/Notice/Notice'
import { StatusLine } from '../../../components/StatusLine/StatusLine'
import { ViewHeader } from '../../../components/ViewHeader/ViewHeader'
import { ViewLayout } from '../../../components/ViewLayout/ViewLayout'
import { PLAYLISTS_ICON, PLAYLISTS_TITLE } from '../constants'
import { PlaylistDialog } from '../PlaylistDialog/PlaylistDialog'
import { PlaylistRow } from '../PlaylistRow/PlaylistRow'
import { describePlaylistsStatus } from '../playlistStatus'
import { usePlaylistsStore } from '../playlistsStore'
import type { SavedPlaylist } from '../types'
import { useDialogAbout } from '../useDialogAbout'

const LoadFailure = () => {
  const loadPlaylists = usePlaylistsStore(state => state.loadPlaylists)

  return (
    <Notice
      title="Couldn't load your playlists"
      description="Check that the drive is still connected, then try again."
      action={<Button onClick={() => void loadPlaylists()}>Try again</Button>}
    />
  )
}

const NoPlaylists = () => (
  <EmptyState
    icon={PLAYLISTS_ICON}
    title="No playlists yet"
    description="Create one with the + button."
  />
)

// What a row's menu starts, each for the row's playlist.
type RowActions = {
  onEdit: (playlist: SavedPlaylist) => void
  onDelete: (playlist: SavedPlaylist) => void
}

const PlaylistList = ({ onEdit, onDelete }: RowActions) => {
  const playlists = usePlaylistsStore(state => state.playlists)

  return (
    // Room below the last row, so it can scroll clear of the New playlist button.
    <ul aria-label={PLAYLISTS_TITLE} className="pb-24">
      {playlists.map(playlist => (
        <PlaylistRow
          key={playlist.fileName}
          playlist={playlist}
          onEdit={() => onEdit(playlist)}
          onDelete={() => onDelete(playlist)}
        />
      ))}
    </ul>
  )
}

const OverviewContent = (actions: RowActions) => {
  const hasPlaylists = usePlaylistsStore(state => state.playlists.length > 0)
  const loadStatus = usePlaylistsStore(state => state.loadStatus)

  if (loadStatus === 'loading') {
    return null
  }
  if (loadStatus === 'failed') {
    return <LoadFailure />
  }
  return hasPlaylists ? <PlaylistList {...actions} /> : <NoPlaylists />
}

const OverviewStatus = () => {
  const count = usePlaylistsStore(state => state.playlists.length)
  const loadStatus = usePlaylistsStore(state => state.loadStatus)
  return <StatusLine>{describePlaylistsStatus(loadStatus, count)}</StatusLine>
}

/**
 * The Playlists view's list of every playlist, sorted by title. Below the header's rule, the
 * status line counts them, and below it the view shows nothing until the Playlists folder is
 * read, then a row per playlist, the failure notice with a "Try again" button, or, without
 * playlists, a message in the middle of the view pointing at the New playlist button. The last row
 * can scroll clear of that button. A row opens its playlist. Editing a playlist opens its dialog
 * filled with its values (`PlaylistDialog`). Deleting one asks first, then a notification says it
 * was deleted, with an Undo button that brings it back.
 *
 * @summary Playlists view's list of playlists
 */
export const PlaylistsOverview = () => {
  const deletePlaylist = usePlaylistsStore(state => state.deletePlaylist)
  const editing = useDialogAbout<SavedPlaylist>()
  const deletion = useDialogAbout<SavedPlaylist>()

  const confirmDelete = () => {
    deletion.close()
    if (deletion.subject) {
      void deletePlaylist(deletion.subject.fileName)
    }
  }

  return (
    <ViewLayout header={<ViewHeader icon={PLAYLISTS_ICON} title={PLAYLISTS_TITLE} />}>
      {/* At least as tall as the view, so the message without playlists can sit in its middle. */}
      <div className="flex min-h-full flex-col">
        <OverviewStatus />
        <OverviewContent onEdit={editing.open} onDelete={deletion.open} />
      </div>
      {/* Kept outside the list, so they can fade out after their row is gone. */}
      {editing.subject && (
        <PlaylistDialog
          isOpen={editing.isOpen}
          onClose={editing.close}
          playlist={editing.subject}
        />
      )}
      {deletion.subject && (
        <ConfirmDialog
          isOpen={deletion.isOpen}
          question={`Delete "${deletion.subject.title}"?`}
          details="This action is irreversible."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={deletion.close}
        />
      )}
    </ViewLayout>
  )
}
