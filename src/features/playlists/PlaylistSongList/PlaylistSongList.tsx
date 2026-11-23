import { MusicalNoteIcon, NumberedListIcon, TrashIcon } from '@heroicons/react/20/solid'
import { useMemo, useState } from 'react'
import { ActionMenu } from '../../../components/ActionMenu/ActionMenu'
import { AlertMark } from '../../../components/AlertMark/AlertMark'
import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog'
import { EmptyState } from '../../../components/EmptyState/EmptyState'
import { SortableList, SortableRow } from '../../../components/SortableList/SortableList'
import { useScannedTracks } from '../../library/scannedTracks'
import type { Track } from '../../library/types'
import { PlayButton } from '../../playback/PlayButton/PlayButton'
import { usePlaybackStore } from '../../playback/playbackStore'
import { ChangePositionDialog } from '../ChangePositionDialog/ChangePositionDialog'
import { PlaylistSongLabel } from '../PlaylistSongLabel/PlaylistSongLabel'
import { findPlaylistSongs, type PlaylistSong, songNameOf } from '../playlistSongs'
import { usePlaylistsStore } from '../playlistsStore'
import { SongPosition } from '../SongPosition/SongPosition'
import type { SavedPlaylist } from '../types'

type PlaylistSongListProps = {
  /** The playlist whose songs the list shows. */
  playlist: SavedPlaylist
}

type SongRowProps = {
  playlist: SavedPlaylist
  song: PlaylistSong
  /** The song's place in the playlist, from 1. */
  position: number
  onRemove: () => void
  onChangePosition: () => void
}

type SongPlayButtonProps = {
  playlist: SavedPlaylist
  song: PlaylistSong
  track: Track
}

const SongPlayButton = ({ playlist, song, track }: SongPlayButtonProps) => {
  const playPlaylist = usePlaylistsStore(state => state.playPlaylist)

  return (
    <PlayButton
      track={track}
      onPlay={() => void playPlaylist(playlist.fileName, song.fileName)}
      isDisabled={!playlist.allSongsFound}
    />
  )
}

// The alert sits where a found song's play button goes, so the names of every row line up.
const MissingSongAlert = () => (
  <span className="flex size-9 shrink-0 items-center justify-center">
    <AlertMark label="Not in the Songs folder" />
  </span>
)

const SongRow = ({ playlist, song, position, onRemove, onChangePosition }: SongRowProps) => {
  const { track } = song
  const isInPlayer = usePlaybackStore(
    state => track !== null && state.session?.track.path === track.path
  )
  const name = songNameOf(song)

  return (
    <SortableRow id={song.fileName} moveLabel={`Move ${name}`} isCurrent={isInPlayer}>
      <SongPosition position={position} songCount={playlist.songs.length} />
      {track ? (
        <SongPlayButton playlist={playlist} song={song} track={track} />
      ) : (
        <MissingSongAlert />
      )}
      <PlaylistSongLabel song={song} isInPlayer={isInPlayer} />
      {/* At the row's end, however short the name. */}
      <span className="ml-auto shrink-0">
        <ActionMenu
          label={`More for ${name}`}
          items={[
            { label: 'Change position', icon: NumberedListIcon, onClick: onChangePosition },
            { label: 'Remove from playlist', icon: TrashIcon, onClick: onRemove }
          ]}
        />
      </span>
    </SortableRow>
  )
}

// The song a dialog is about stays while the dialog fades out, after its row may be gone.
const useSongDialog = () => {
  const [song, setSong] = useState<PlaylistSong | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  return {
    song,
    isOpen,
    open: (chosenSong: PlaylistSong) => {
      setSong(chosenSong)
      setIsOpen(true)
    },
    close: () => setIsOpen(false)
  }
}

/**
 * The songs of a playlist, in its order, on its page. Each row starts with a Move handle that
 * drags the song to another place, with the pointer or from the keyboard, and the playlist is
 * saved as soon as it's dropped. The song's position in the playlist, from 1, follows the handle,
 * and changes with every drop, removal and Undo. A found song then has a row like in the song
 * list, whose play button plays the playlist from it, disabled while songs are missing. A song
 * the last scan of the Songs folder lacks is still listed, under its file name in a lighter ink,
 * with an alert where its play button would be, and can be moved and removed all the same. Each
 * row ends with a menu of what can be done to the song. Change position opens a dialog that places
 * it before or after another song. Remove from playlist asks first, then a notification says the
 * song was removed, with an Undo button that puts it back. Removing never touches the Songs
 * folder. A playlist without songs says so in the middle of the view, as the page lays it out.
 *
 * @summary Songs of a playlist, to play, reorder and remove
 */
export const PlaylistSongList = ({ playlist }: PlaylistSongListProps) => {
  const tracks = useScannedTracks()
  const moveSong = usePlaylistsStore(state => state.moveSong)
  const removeSong = usePlaylistsStore(state => state.removeSong)
  const songs = useMemo(() => findPlaylistSongs(playlist.songs, tracks), [playlist.songs, tracks])
  const removal = useSongDialog()
  const positionChange = useSongDialog()

  const nameOf = (fileName: string) => {
    const song = songs.find(other => other.fileName === fileName)
    return song ? songNameOf(song) : fileName
  }
  const confirmRemove = () => {
    removal.close()
    if (removal.song) {
      void removeSong(playlist.fileName, removal.song.fileName)
    }
  }

  return (
    <>
      {songs.length === 0 ? (
        <EmptyState icon={MusicalNoteIcon} title="No songs in this playlist" />
      ) : (
        <div className="pb-8">
          <SortableList
            label={`Songs of ${playlist.title}`}
            ids={playlist.songs}
            nameOf={nameOf}
            onMove={(from, to) => void moveSong(playlist.fileName, from, to)}
          >
            {songs.map((song, index) => (
              <SongRow
                key={song.fileName}
                playlist={playlist}
                song={song}
                position={index + 1}
                onRemove={() => removal.open(song)}
                onChangePosition={() => positionChange.open(song)}
              />
            ))}
          </SortableList>
        </div>
      )}
      {/* Kept outside the list, so they can fade out after the last song's removal empties it. */}
      {removal.song && (
        <ConfirmDialog
          isOpen={removal.isOpen}
          question={`Remove "${songNameOf(removal.song)}" from "${playlist.title}"?`}
          details="The song stays in the Songs folder."
          confirmLabel="Remove"
          onConfirm={confirmRemove}
          onCancel={removal.close}
        />
      )}
      {positionChange.song && (
        <ChangePositionDialog
          isOpen={positionChange.isOpen}
          onClose={positionChange.close}
          playlist={playlist}
          songs={songs}
          song={positionChange.song}
        />
      )}
    </>
  )
}
