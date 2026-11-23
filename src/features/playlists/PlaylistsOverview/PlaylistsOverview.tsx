import { useState } from 'react'
import { Button } from '../../../components/Button/Button'
import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog'
import { EmptyState } from '../../../components/EmptyState/EmptyState'
import { Notice } from '../../../components/Notice/Notice'
import { StatusLine } from '../../../components/StatusLine/StatusLine'
import { ViewHeader } from '../../../components/ViewHeader/ViewHeader'
import { ViewLayout } from '../../../components/ViewLayout/ViewLayout'
import { PLAYLISTS_ICON, PLAYLISTS_TITLE } from '../constants'
import { PlaylistRow } from '../PlaylistRow/PlaylistRow'
import { describePlaylistsStatus } from '../playlistStatus'
import { usePlaylistsStore } from '../playlistsStore'
import type { SavedPlaylist } from '../types'

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

const PlaylistList = ({ onDelete }: { onDelete: (playlist: SavedPlaylist) => void }) => {
  const playlists = usePlaylistsStore(state => state.playlists)

  return (
    // Room below the last row, so it can scroll clear of the New playlist button.
    <ul aria-label={PLAYLISTS_TITLE} className="pb-24">
      {playlists.map(playlist => (
        <PlaylistRow
          key={playlist.fileName}
          playlist={playlist}
          onDelete={() => onDelete(playlist)}
        />
      ))}
    </ul>
  )
}

const OverviewContent = ({ onDelete }: { onDelete: (playlist: SavedPlaylist) => void }) => {
  const hasPlaylists = usePlaylistsStore(state => state.playlists.length > 0)
  const loadStatus = usePlaylistsStore(state => state.loadStatus)

  if (loadStatus === 'loading') {
    return null
  }
  if (loadStatus === 'failed') {
    return <LoadFailure />
  }
  return hasPlaylists ? <PlaylistList onDelete={onDelete} /> : <NoPlaylists />
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
 * can scroll clear of that button. Deleting a playlist asks first, then a
 * notification says it was deleted, with an Undo button that brings it back.
 *
 * @summary Playlists view's list of playlists
 */
export const PlaylistsOverview = () => {
  const deletePlaylist = usePlaylistsStore(state => state.deletePlaylist)
  // The playlist asked about stays while the dialog fades out, after its row is gone.
  const [askedPlaylist, setAskedPlaylist] = useState<SavedPlaylist | null>(null)
  const [isAsking, setIsAsking] = useState(false)

  const askToDelete = (playlist: SavedPlaylist) => {
    setAskedPlaylist(playlist)
    setIsAsking(true)
  }
  const confirmDelete = (playlist: SavedPlaylist) => {
    setIsAsking(false)
    void deletePlaylist(playlist.fileName)
  }

  return (
    <ViewLayout header={<ViewHeader icon={PLAYLISTS_ICON} title={PLAYLISTS_TITLE} />}>
      {/* At least as tall as the view, so the message without playlists can sit in its middle. */}
      <div className="flex min-h-full flex-col">
        <OverviewStatus />
        <OverviewContent onDelete={askToDelete} />
      </div>
      {askedPlaylist && (
        <ConfirmDialog
          isOpen={isAsking}
          question={`Delete "${askedPlaylist.title}"?`}
          details="This action is irreversible."
          confirmLabel="Delete"
          onConfirm={() => confirmDelete(askedPlaylist)}
          onCancel={() => setIsAsking(false)}
        />
      )}
    </ViewLayout>
  )
}
