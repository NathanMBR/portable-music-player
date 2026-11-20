import { useMemo, useState } from 'react'
import { Button } from '../../../components/Button/Button'
import { Checkbox } from '../../../components/Checkbox/Checkbox'
import { ListRow } from '../../../components/ListRow/ListRow'
import { Modal, ModalButtons, ModalTitle } from '../../../components/Modal/Modal'
import { TextField } from '../../../components/TextField/TextField'
import { CoverThumbnail } from '../../library/CoverThumbnail/CoverThumbnail'
import { formatSongCount } from '../../library/libraryStatus'
import { useScannedTracks, useSortedTracks } from '../../library/scannedTracks'
import { TrackName } from '../../library/TrackName/TrackName'
import type { Track } from '../../library/types'
import { MAX_TITLE_LENGTH } from '../constants'
import { pickedFileNames } from '../playlistSongs'
import { usePlaylistsStore } from '../playlistsStore'
import { matchesSearch } from '../songSearch'

type NewPlaylistDialogProps = {
  /** Shows the dialog, with an empty form each time it opens. */
  isOpen: boolean
  /** Runs on Cancel, Escape, a click outside the dialog, and once the playlist is saved. */
  onClose: () => void
}

type SongPickerProps = {
  /** The songs the search finds, in the Songs view's order. */
  tracks: Track[]
  pickedPaths: ReadonlySet<string>
  onPick: (path: string, isPicked: boolean) => void
  /** Why no song shows, when none does. */
  emptyMessage: string
}

// The songs scroll on their own, so the panel never grows taller than the window. The scrollbar
// keeps clear of the rows, and of the panel's bottom, since the buttons sit below it.
const SONG_PICKER_CLASSES = 'mt-3 min-h-20 overflow-y-auto pr-1 [&::-webkit-scrollbar-track]:mb-0'

const SongPicker = ({ tracks, pickedPaths, onPick, emptyMessage }: SongPickerProps) => (
  <div className={SONG_PICKER_CLASSES}>
    {tracks.length === 0 ? (
      <p className="py-3 text-sm text-ink-faded">{emptyMessage}</p>
    ) : (
      <ul aria-label="Songs">
        {tracks.map(track => (
          <ListRow key={track.path}>
            <Checkbox
              checked={pickedPaths.has(track.path)}
              onChange={isPicked => onPick(track.path, isPicked)}
            >
              <CoverThumbnail path={track.path} />
              <TrackName track={track} />
            </Checkbox>
          </ListRow>
        ))}
      </ul>
    )}
  </div>
)

const togglePath = (paths: ReadonlySet<string>, path: string, isPicked: boolean) => {
  const toggled = new Set(paths)
  if (isPicked) {
    toggled.add(path)
  } else {
    toggled.delete(path)
  }
  return toggled
}

const emptyPickerMessage = (hasSongs: boolean, search: string) =>
  hasSongs ? `No songs match "${search.trim()}".` : 'The Songs folder has no songs yet.'

// Inside the panel, which Headless UI takes away once the dialog closes, so each opening starts
// with an empty form.
const NewPlaylistForm = ({ onClose }: Pick<NewPlaylistDialogProps, 'onClose'>) => {
  const createPlaylist = usePlaylistsStore(state => state.createPlaylist)
  const tracks = useSortedTracks(useScannedTracks())
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [search, setSearch] = useState('')
  const [pickedPaths, setPickedPaths] = useState<ReadonlySet<string>>(new Set())
  const [isSaving, setIsSaving] = useState(false)
  const foundTracks = useMemo(
    () => tracks.filter(track => matchesSearch(track, search)),
    [tracks, search]
  )

  const pick = (path: string, isPicked: boolean) =>
    setPickedPaths(picked => togglePath(picked, path, isPicked))

  const save = async () => {
    setIsSaving(true)
    const isCreated = await createPlaylist({
      title: title.trim(),
      description: description.trim(),
      songs: pickedFileNames(tracks, pickedPaths)
    })
    setIsSaving(false)
    if (isCreated) {
      onClose()
    }
  }

  return (
    <>
      <ModalTitle>New playlist</ModalTitle>
      <div className="mt-4 flex flex-col gap-3">
        <TextField
          label="Title"
          value={title}
          onChange={setTitle}
          maxLength={MAX_TITLE_LENGTH}
          isRequired
        />
        <TextField label="Description" value={description} onChange={setDescription} />
        <TextField
          label="Search songs"
          type="search"
          value={search}
          onChange={setSearch}
          placeholder="Title, artist or file name"
        />
      </div>
      <SongPicker
        tracks={foundTracks}
        pickedPaths={pickedPaths}
        onPick={pick}
        emptyMessage={emptyPickerMessage(tracks.length > 0, search)}
      />
      <p aria-live="polite" className="mt-2 text-sm text-ink-faded">
        {formatSongCount(pickedPaths.size)} picked
      </p>
      <ModalButtons>
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => void save()} isDisabled={title.trim() === '' || isSaving}>
          Save
        </Button>
      </ModalButtons>
    </>
  )
}

/**
 * Modal dialog creating a playlist: its title, required, and its description, then the songs of
 * the Songs folder, in the Songs view's order, each with a checkbox. The search above them finds
 * songs by title, artist or file name, whatever their case and accents, and picked songs stay
 * picked while it hides them; the count below the list says how many are. Save is disabled until
 * the title isn't blank, and the playlist keeps its songs in the list's order, whatever order
 * they were picked in. It may have none. A failed save keeps the dialog open with what was typed,
 * and a notification says why.
 *
 * @summary Dialog creating a playlist from the songs of the Songs folder
 */
export const NewPlaylistDialog = ({ isOpen, onClose }: NewPlaylistDialogProps) => (
  <Modal isOpen={isOpen} onClose={onClose} isWide>
    <NewPlaylistForm onClose={onClose} />
  </Modal>
)
