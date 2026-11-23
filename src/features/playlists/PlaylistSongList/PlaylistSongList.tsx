import { MinusCircleIcon, MusicalNoteIcon, PhotoIcon } from '@heroicons/react/20/solid'
import { useMemo, useState } from 'react'
import { AlertMark } from '../../../components/AlertMark/AlertMark'
import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog'
import { EmptyState } from '../../../components/EmptyState/EmptyState'
import { IconButton } from '../../../components/IconButton/IconButton'
import { SortableList, SortableRow } from '../../../components/SortableList/SortableList'
import { CoverThumbnail } from '../../library/CoverThumbnail/CoverThumbnail'
import { useScannedTracks } from '../../library/scannedTracks'
import { TrackName } from '../../library/TrackName/TrackName'
import type { Track } from '../../library/types'
import { PlayButton } from '../../playback/PlayButton/PlayButton'
import { usePlaybackStore } from '../../playback/playbackStore'
import { findPlaylistSongs, type PlaylistSong, songNameOf } from '../playlistSongs'
import { usePlaylistsStore } from '../playlistsStore'
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
}

type FoundSongProps = {
  playlist: SavedPlaylist
  song: PlaylistSong
  track: Track
  isInPlayer: boolean
}

const FoundSong = ({ playlist, song, track, isInPlayer }: FoundSongProps) => {
  const playPlaylist = usePlaylistsStore(state => state.playPlaylist)

  return (
    <>
      <PlayButton
        track={track}
        onPlay={() => void playPlaylist(playlist.fileName, song.fileName)}
        isDisabled={!playlist.allSongsFound}
      />
      <CoverThumbnail path={track.path} />
      <TrackName track={track} isInPlayer={isInPlayer} />
    </>
  )
}

// The alert and the square sit where a found song's play button and cover go, so the names of
// every row line up.
const MissingSong = ({ name }: { name: string }) => (
  <>
    <span className="flex size-9 shrink-0 items-center justify-center">
      <AlertMark label="Not in the Songs folder" />
    </span>
    <div className="flex size-9 shrink-0 items-center justify-center rounded bg-rule">
      <PhotoIcon aria-hidden="true" className="size-5 text-ink-faded" />
    </div>
    <span title={name} className="truncate text-ink-faded font-stretch-semi-condensed">
      {name}
    </span>
  </>
)

// As wide as the playlist's longest position, so every row's play button and name line up. The
// list itself tells screen readers each row's position, so they don't hear it twice.
const SongPosition = ({ position, songCount }: { position: number; songCount: number }) => (
  <span
    aria-hidden="true"
    style={{ width: `${String(songCount).length}ch` }}
    className="shrink-0 text-right text-sm text-ink-faded tabular-nums"
  >
    {position}
  </span>
)

const SongRow = ({ playlist, song, position, onRemove }: SongRowProps) => {
  const { track } = song
  const isInPlayer = usePlaybackStore(
    state => track !== null && state.session?.track.path === track.path
  )
  const name = songNameOf(song)

  return (
    <SortableRow id={song.fileName} moveLabel={`Move ${name}`} isCurrent={isInPlayer}>
      <SongPosition position={position} songCount={playlist.songs.length} />
      {track ? (
        <FoundSong playlist={playlist} song={song} track={track} isInPlayer={isInPlayer} />
      ) : (
        <MissingSong name={name} />
      )}
      {/* At the row's end, however short the name. */}
      <span className="ml-auto shrink-0">
        <IconButton icon={MinusCircleIcon} label={`Remove ${name}`} onClick={onRemove} />
      </span>
    </SortableRow>
  )
}

/**
 * The songs of a playlist, in its order, on its page. Each row starts with a Move handle that
 * drags the song to another place, with the pointer or from the keyboard, and the playlist is
 * saved as soon as it's dropped. The song's position in the playlist, from 1, follows the handle,
 * and changes with every drop, removal and Undo. A found song then has a row like in the song
 * list, whose play button plays the playlist from it, disabled while songs are missing. A song
 * the last scan of the Songs folder lacks is still listed, under its file name in a lighter ink,
 * with an alert where its play button would be, and can be moved and removed all the same. Each
 * row ends with a Remove button, which asks first, then a notification says the song was removed,
 * with an Undo button that puts it back. Removing never touches the Songs folder. A playlist
 * without songs says so in the middle of the view, as the page lays it out.
 *
 * @summary Songs of a playlist, to play, reorder and remove
 */
export const PlaylistSongList = ({ playlist }: PlaylistSongListProps) => {
  const tracks = useScannedTracks()
  const moveSong = usePlaylistsStore(state => state.moveSong)
  const removeSong = usePlaylistsStore(state => state.removeSong)
  const songs = useMemo(() => findPlaylistSongs(playlist.songs, tracks), [playlist.songs, tracks])
  // The song asked about stays while the dialog fades out, after its row is gone.
  const [askedSong, setAskedSong] = useState<PlaylistSong | null>(null)
  const [isAsking, setIsAsking] = useState(false)

  const nameOf = (fileName: string) => {
    const song = songs.find(other => other.fileName === fileName)
    return song ? songNameOf(song) : fileName
  }
  const askToRemove = (song: PlaylistSong) => {
    setAskedSong(song)
    setIsAsking(true)
  }
  const confirmRemove = (song: PlaylistSong) => {
    setIsAsking(false)
    void removeSong(playlist.fileName, song.fileName)
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
                onRemove={() => askToRemove(song)}
              />
            ))}
          </SortableList>
        </div>
      )}
      {/* Kept outside the list, so it can fade out after the last song's removal empties it. */}
      {askedSong && (
        <ConfirmDialog
          isOpen={isAsking}
          question={`Remove "${songNameOf(askedSong)}" from "${playlist.title}"?`}
          details="The song stays in the Songs folder."
          confirmLabel="Remove"
          onConfirm={() => confirmRemove(askedSong)}
          onCancel={() => setIsAsking(false)}
        />
      )}
    </>
  )
}
