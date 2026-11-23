import { useMemo, useState } from 'react'
import { Button } from '../../../components/Button/Button'
import { Modal, ModalButtons, ModalTitle } from '../../../components/Modal/Modal'
import { RadioGroup } from '../../../components/RadioGroup/RadioGroup'
import { TextField } from '../../../components/TextField/TextField'
import { fullTrackName } from '../../library/trackName'
import { PlaylistSongLabel } from '../PlaylistSongLabel/PlaylistSongLabel'
import { type PlaylistSong, songNameOf } from '../playlistSongs'
import { usePlaylistsStore } from '../playlistsStore'
import { SongPosition } from '../SongPosition/SongPosition'
import { type Placement, placementIndex } from '../songPlacement'
import { matchesPlaylistSearch } from '../songSearch'
import type { SavedPlaylist } from '../types'

type ChangePositionDialogProps = {
  /** Shows the dialog, which starts each time it opens with Before and no song picked. */
  isOpen: boolean
  /** Runs on Cancel, Escape, a click outside the dialog, and on Confirm. */
  onClose: () => void
  /** The playlist the song moves in. */
  playlist: SavedPlaylist
  /** The playlist's songs, matched to the last scan, in its order. */
  songs: PlaylistSong[]
  /** The song to move. */
  song: PlaylistSong
}

type FormProps = Omit<ChangePositionDialogProps, 'isOpen'>

type ReferenceSong = { song: PlaylistSong; position: number }

const PLACEMENTS = [
  { value: 'before', label: 'Before' },
  { value: 'after', label: 'After' }
] as const satisfies readonly { value: Placement; label: string }[]

// The songs scroll on their own, so the panel never grows taller than the window. The scrollbar
// keeps clear of the rows, and of the panel's bottom, since the buttons sit below it.
const SONG_PICKER_CLASSES = 'mt-3 min-h-20 overflow-y-auto pr-1 [&::-webkit-scrollbar-track]:mb-0'

// The name screen readers hear and the log writes: the position the row shows, then its name.
const optionLabelOf = ({ song, position }: ReferenceSong) =>
  `${position}. ${song.track ? fullTrackName(song.track) : songNameOf(song)}`

const emptyPickerMessage = (hasOtherSongs: boolean, search: string) =>
  hasOtherSongs ? `No songs match "${search.trim()}".` : 'No other songs in this playlist.'

type SongPickerProps = {
  referenceSongs: ReferenceSong[]
  songCount: number
  pickedSong: string | null
  onPick: (fileName: string) => void
  emptyMessage: string
}

const SongPicker = ({
  referenceSongs,
  songCount,
  pickedSong,
  onPick,
  emptyMessage
}: SongPickerProps) => (
  <div className={SONG_PICKER_CLASSES}>
    {referenceSongs.length === 0 ? (
      <p className="py-3 text-sm text-ink-faded">{emptyMessage}</p>
    ) : (
      <RadioGroup
        label="Songs"
        layout="rows"
        value={pickedSong}
        onChange={onPick}
        options={referenceSongs.map(reference => ({
          value: reference.song.fileName,
          label: optionLabelOf(reference),
          content: (
            <>
              <SongPosition position={reference.position} songCount={songCount} />
              <PlaylistSongLabel song={reference.song} />
            </>
          )
        }))}
      />
    )}
  </div>
)

// Inside the panel, which Headless UI unmounts once the dialog closes, so each opening starts anew.
const ChangePositionForm = ({ onClose, playlist, songs, song }: FormProps) => {
  const moveSong = usePlaylistsStore(state => state.moveSong)
  const [placement, setPlacement] = useState<Placement>('before')
  const [search, setSearch] = useState('')
  const [pickedSong, setPickedSong] = useState<string | null>(null)

  const otherSongs = useMemo(
    () =>
      songs
        .map((other, index) => ({ song: other, position: index + 1 }))
        .filter(other => other.song.fileName !== song.fileName),
    [songs, song.fileName]
  )
  const foundSongs = otherSongs.filter(other =>
    matchesPlaylistSearch(other.song, other.position, search)
  )

  const confirm = (referenceSong: string) => {
    onClose()
    const from = playlist.songs.indexOf(song.fileName)
    const to = placementIndex(playlist.songs, song.fileName, referenceSong, placement)
    if (to !== from) {
      void moveSong(playlist.fileName, from, to)
    }
  }

  return (
    <>
      <ModalTitle>Change the position of "{songNameOf(song)}"</ModalTitle>
      <div className="mt-4">
        <RadioGroup
          label="Place it"
          isLabelShown
          options={PLACEMENTS}
          value={placement}
          onChange={setPlacement}
        />
      </div>
      <div className="mt-4">
        <TextField
          label="Search songs"
          type="search"
          value={search}
          onChange={setSearch}
          placeholder="Title, artist, file name or position"
        />
      </div>
      <SongPicker
        referenceSongs={foundSongs}
        songCount={songs.length}
        pickedSong={pickedSong}
        onPick={setPickedSong}
        emptyMessage={emptyPickerMessage(otherSongs.length > 0, search)}
      />
      <ModalButtons>
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => pickedSong !== null && confirm(pickedSong)}
          isDisabled={pickedSong === null}
        >
          Confirm
        </Button>
      </ModalButtons>
    </>
  )
}

/**
 * Dialog that moves a song of a playlist next to another, opened from the song's menu with Change
 * position. Its title names the song. Below it, Before or After, on one line, Before at first, says
 * which side of the other song it goes. A search box then narrows the playlist's other songs, each
 * listed with its position, by title, artist, file name or position: typing 4 finds the fourth
 * song. A song the last scan lacks is listed and found under its file name. One song is picked at a
 * time, and stays picked while the search hides it. Confirm, on once a song is picked, moves the
 * song there and saves the playlist, like a drag of its Move handle; placing it where it already is
 * saves nothing. Cancel leaves the playlist as it was.
 *
 * @summary Moves a playlist's song before or after another
 */
export const ChangePositionDialog = ({ isOpen, ...formProps }: ChangePositionDialogProps) => (
  <Modal isOpen={isOpen} onClose={formProps.onClose}>
    <ChangePositionForm {...formProps} />
  </Modal>
)
