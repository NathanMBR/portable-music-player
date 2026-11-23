import type { Meta, StoryObj } from '@storybook/react-vite'
import type { InvokeArgs } from '@tauri-apps/api/core'
import { expect, fn, waitFor, within } from 'storybook/test'
import { noCover } from '../../../testing/covers'
import { loggedMessages } from '../../../testing/logs'
import { failingCommand, mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { withNotificationArea } from '../../../testing/withNotificationArea'
import { useLibraryStore } from '../../library/libraryStore'
import type { Track } from '../../library/types'
import { usePlaylistsStore } from '../playlistsStore'
import type { PlaylistContents, SavedPlaylist } from '../types'
import { PlaylistDialog } from './PlaylistDialog'

const boatSong: Track = { path: 'Songs/Boat Song.mp3', title: 'Boat Song', artist: 'Woodkid' }
const leperMessiah: Track = {
  path: 'Songs/Leper Messiah.mp3',
  title: 'Leper Messiah',
  artist: 'Metallica'
}
const morningStar: Track = {
  path: 'Songs/Morning Star.mp3',
  title: 'Morning Star',
  artist: 'Angra'
}
const carpeDiemBaby: Track = {
  path: 'Songs/Carpe Diem Baby.mp3',
  title: 'Carpe Diem Baby',
  artist: 'Metallica'
}
const windsOfDestination: Track = {
  path: 'Songs/Winds of Destination.mp3',
  title: 'Winds of Destination',
  artist: 'Angra'
}
// A file name that isn't the title, so the search can find it by its file name alone.
const drawnToYou: Track = {
  path: 'Songs/07 Drawn to You.mp3',
  title: 'Drawn to You',
  artist: 'Woodkid'
}

// In the order the scan lists them; the dialog sorts them by title, as the Songs view does.
const TRACKS = [morningStar, boatSong, windsOfDestination, leperMessiah, drawnToYou, carpeDiemBaby]

const TAKEN_ERROR = 'A playlist named 1763581234567-Road_trip.json already exists'

const roadTrip: SavedPlaylist = {
  fileName: '1763581234567-Road_trip.json',
  title: 'Road trip',
  description: 'For the long drive',
  allSongsFound: true,
  songs: ['Boat Song.mp3', 'Winds of Destination.mp3']
}

const createPlaylist = fn((_args?: InvokeArgs) => roadTrip)

// A playlist to edit, with a song the Songs folder doesn't hold anymore between its found ones.
const MISSING_SONG = 'Ancient Winds.mp3'
const summerDrive: SavedPlaylist = {
  fileName: '1763590012345-Summer_drive.json',
  title: 'Summer drive',
  description: 'Coast road',
  allSongsFound: false,
  songs: ['Winds of Destination.mp3', MISSING_SONG, 'Boat Song.mp3']
}

const SAVE_ERROR =
  "Couldn't save the playlist 1763590012345-Summer_drive.json: Read-only file system (os error 30)"

// Rust saves what it's given, and finds every song but the missing one.
const savePlaylist = fn((args?: InvokeArgs) => {
  const { fileName, playlist } = args as { fileName: string; playlist: PlaylistContents }
  return { fileName, ...playlist, allSongsFound: !playlist.songs.includes(MISSING_SONG) }
})

const songNamesIn = (dialog: HTMLElement) =>
  within(dialog)
    .queryAllByRole('checkbox')
    .map(checkbox => checkbox.textContent)

const meta = {
  component: PlaylistDialog,
  args: { isOpen: true, onClose: fn() },
  decorators: [withNotificationArea],
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(720) },
  beforeEach: () => {
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: TRACKS } })
    mockCommands({ read_cover: noCover, create_playlist: createPlaylist })
  }
} satisfies Meta<typeof PlaylistDialog>

export default meta
type Story = StoryObj<typeof meta>
type UserEvent = Parameters<NonNullable<Story['play']>>[0]['userEvent']

const findDialog = (canvasElement: HTMLElement) =>
  within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'New playlist' })

/** Fills in the first step with a title, then goes on to the songs. */
const goToTheSongs = async (dialog: HTMLElement, userEvent: UserEvent, title = 'Road trip') => {
  await userEvent.type(within(dialog).getByRole('textbox', { name: 'Title' }), title)
  await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }))
  return within(dialog).findByRole('searchbox', { name: 'Search songs' })
}

/**
 * The first step: the title, focused, and the description. Next is disabled until a title is
 * typed, and the songs come in the second step.
 */
export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await findDialog(canvasElement)

    await expect(dialog).toHaveAccessibleDescription('Step 1 of 2: Title and description')
    await waitFor(() =>
      expect(within(dialog).getByRole('textbox', { name: 'Title' })).toHaveFocus()
    )
    await expect(within(dialog).getByRole('textbox', { name: 'Description' })).toBeVisible()
    await expect(within(dialog).getByRole('button', { name: 'Next' })).toBeDisabled()
    await expect(within(dialog).queryByRole('searchbox')).toBeNull()
  }
}

/** Next turns on once the title isn't blank: spaces alone aren't a title. */
export const NextNeedsATitle: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await findDialog(canvasElement)
    const title = within(dialog).getByRole('textbox', { name: 'Title' })
    const next = within(dialog).getByRole('button', { name: 'Next' })

    await userEvent.type(title, '   ')
    await expect(next).toBeDisabled()

    await userEvent.type(title, 'Road trip')
    await expect(next).toBeEnabled()
  }
}

/**
 * The second step: the search, focused, then the songs in the Songs view's order, none picked,
 * with Back and Save.
 */
export const TheSongsStep: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await findDialog(canvasElement)

    const search = await goToTheSongs(dialog, userEvent)

    await expect(dialog).toHaveAccessibleDescription('Step 2 of 2: Songs')
    await waitFor(() => expect(search).toHaveFocus())
    await expect(within(dialog).queryByRole('textbox', { name: 'Title' })).toBeNull()
    await expect(songNamesIn(dialog)).toEqual([
      'Boat Song · Woodkid',
      'Carpe Diem Baby · Metallica',
      'Drawn to You · Woodkid',
      'Leper Messiah · Metallica',
      'Morning Star · Angra',
      'Winds of Destination · Angra'
    ])
    await expect(within(dialog).getByText('0 songs picked')).toBeVisible()
    await expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
  }
}

/**
 * Back returns to the first step with the title and description as typed, focusing the title,
 * and the search and the picked songs stay for when Next comes back to them.
 */
export const GoingBack: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await findDialog(canvasElement)
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Description' }),
      'For the long drive'
    )
    const search = await goToTheSongs(dialog, userEvent)
    await userEvent.type(search, 'angra')
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^Morning Star/ }))

    await userEvent.click(within(dialog).getByRole('button', { name: 'Back' }))

    const title = within(dialog).getByRole('textbox', { name: 'Title' })
    await expect(title).toHaveValue('Road trip')
    await waitFor(() => expect(title).toHaveFocus())
    await expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveValue(
      'For the long drive'
    )

    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }))
    await expect(within(dialog).getByRole('searchbox')).toHaveValue('angra')
    await expect(within(dialog).getByRole('checkbox', { name: /^Morning Star/ })).toBeChecked()
    await expect(within(dialog).getByText('1 song picked')).toBeVisible()
  }
}

/** The search finds songs by their title, their artist or their file name. */
export const Searching: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await findDialog(canvasElement)
    const search = await goToTheSongs(dialog, userEvent)

    await userEvent.type(search, 'star')
    await expect(songNamesIn(dialog)).toEqual(['Morning Star · Angra'])

    await userEvent.clear(search)
    await userEvent.type(search, 'metallica')
    await expect(songNamesIn(dialog)).toEqual([
      'Carpe Diem Baby · Metallica',
      'Leper Messiah · Metallica'
    ])

    await userEvent.clear(search)
    await userEvent.type(search, '07')
    await expect(songNamesIn(dialog)).toEqual(['Drawn to You · Woodkid'])
  }
}

/** Uppercase and accents count as their plain form. */
export const SearchIgnoresCaseAndAccents: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await findDialog(canvasElement)
    const search = await goToTheSongs(dialog, userEvent)

    await userEvent.type(search, 'WÓODKID')

    await expect(songNamesIn(dialog)).toEqual(['Boat Song · Woodkid', 'Drawn to You · Woodkid'])
  }
}

/** A search that finds nothing says so. */
export const NothingFound: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await findDialog(canvasElement)
    const search = await goToTheSongs(dialog, userEvent)

    await userEvent.type(search, 'Audioslave')

    await expect(within(dialog).getByText('No songs match "Audioslave".')).toBeVisible()
  }
}

/** Picked songs stay picked while the search hides them, and the count below the list says so. */
export const KeepsPickedSongsWhileSearching: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await findDialog(canvasElement)
    const search = await goToTheSongs(dialog, userEvent)
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^Winds of Destination/ }))

    await userEvent.type(search, 'boat')
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^Boat Song/ }))
    await userEvent.clear(search)

    await expect(
      within(dialog).getByRole('checkbox', { name: /^Winds of Destination/ })
    ).toBeChecked()
    await expect(within(dialog).getByRole('checkbox', { name: /^Boat Song/ })).toBeChecked()
    await expect(within(dialog).getByText('2 songs picked')).toBeVisible()
  }
}

/**
 * Save writes the playlist, its title and description trimmed, and its songs in the list's order,
 * whatever order they were picked in, then closes the dialog.
 */
export const Saving: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = await findDialog(canvasElement)
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Description' }),
      'For the long drive'
    )
    await goToTheSongs(dialog, userEvent, ' Road trip ')
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^Winds of Destination/ }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^Boat Song/ }))

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(args.onClose).toHaveBeenCalledOnce())
    await expect(createPlaylist).toHaveBeenCalledWith({
      fileName: expect.stringMatching(/^\d+-Road_trip\.json$/),
      playlist: {
        title: 'Road trip',
        description: 'For the long drive',
        songs: ['Boat Song.mp3', 'Winds of Destination.mp3']
      }
    })
    await expect(loggedMessages()).toContain('Created playlist "Road trip" with 2 songs')
  }
}

/** A playlist may have no songs yet. */
export const SavingWithoutSongs: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = await findDialog(canvasElement)
    await goToTheSongs(dialog, userEvent)

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(args.onClose).toHaveBeenCalledOnce())
    await expect(createPlaylist).toHaveBeenCalledWith(
      expect.objectContaining({ playlist: expect.objectContaining({ songs: [] }) })
    )
  }
}

/**
 * When the file can't be written, the dialog stays open on the songs, as they were picked, and a
 * notification says why.
 */
export const SaveFailing: Story = {
  beforeEach: () => {
    mockCommands({ read_cover: noCover, create_playlist: failingCommand(TAKEN_ERROR) })
  },
  play: async ({ args, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    const dialog = await findDialog(canvasElement)
    await goToTheSongs(dialog, userEvent)
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^Boat Song/ }))

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(page.getByText(TAKEN_ERROR)).toBeVisible())
    await expect(args.onClose).not.toHaveBeenCalled()
    await expect(within(dialog).getByRole('checkbox', { name: /^Boat Song/ })).toBeChecked()
    await expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
  }
}

/** Cancel closes the dialog without writing anything. */
export const Cancelling: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = await findDialog(canvasElement)
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Title' }), 'Road trip')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await expect(args.onClose).toHaveBeenCalledOnce()
    await expect(createPlaylist).not.toHaveBeenCalled()
  }
}

/** Without songs in the Songs folder, the list says so, and a playlist can still be made. */
export const WithoutSongsInTheLibrary: Story = {
  beforeEach: () => {
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: [] } })
  },
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await findDialog(canvasElement)
    await goToTheSongs(dialog, userEvent)

    await expect(within(dialog).getByText('The Songs folder has no songs yet.')).toBeVisible()
    await expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
  }
}

/** Editing: the playlist the store holds, which the dialog saves over. */
const editing = (playlist: SavedPlaylist) => {
  usePlaylistsStore.setState({ playlists: [playlist], loadStatus: 'loaded' })
  mockCommands({ read_cover: noCover, save_playlist: savePlaylist })
}

const findEditDialog = (canvasElement: HTMLElement) =>
  within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Edit playlist' })

/**
 * Given a playlist, the dialog edits it: it says "Edit playlist", and starts from the playlist's
 * title and description, then its songs, picked. A song the Songs folder lacks can't be shown,
 * so the dialog says it stays in the playlist.
 */
export const Editing: Story = {
  args: { playlist: summerDrive },
  beforeEach: () => {
    editing(summerDrive)
  },
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await findEditDialog(canvasElement)
    await expect(within(dialog).getByRole('textbox', { name: 'Title' })).toHaveValue('Summer drive')
    await expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveValue(
      'Coast road'
    )

    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }))

    const picked = within(dialog)
      .getAllByRole('checkbox', { checked: true })
      .map(checkbox => checkbox.textContent)
    await expect(picked).toEqual(['Boat Song · Woodkid', 'Winds of Destination · Angra'])
    await expect(within(dialog).getByText('2 songs picked')).toBeVisible()
    await expect(
      within(dialog).getByText('1 song not in the Songs folder stays in the playlist.')
    ).toBeVisible()
  }
}

/**
 * Save writes the playlist over its own file: the songs still picked keep their place, the
 * unpicked ones leave, the newly picked ones follow in the list's order, and a song the Songs
 * folder lacks stays where it was.
 */
export const SavingAnEdit: Story = {
  args: { playlist: summerDrive },
  beforeEach: () => {
    editing(summerDrive)
  },
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = await findEditDialog(canvasElement)
    const title = within(dialog).getByRole('textbox', { name: 'Title' })
    await userEvent.clear(title)
    await userEvent.type(title, 'Summer drive home')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^Boat Song/ }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^Morning Star/ }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^Carpe Diem Baby/ }))

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(args.onClose).toHaveBeenCalledOnce())
    await expect(savePlaylist).toHaveBeenCalledWith({
      fileName: summerDrive.fileName,
      playlist: {
        title: 'Summer drive home',
        description: 'Coast road',
        songs: ['Winds of Destination.mp3', MISSING_SONG, 'Carpe Diem Baby.mp3', 'Morning Star.mp3']
      }
    })
    await expect(createPlaylist).not.toHaveBeenCalled()
    await expect(loggedMessages()).toContain('Edited playlist "Summer drive home"')
  }
}

/** When the file can't be written, the edit stays open as it was, and a notification says why. */
export const EditFailing: Story = {
  args: { playlist: summerDrive },
  beforeEach: () => {
    editing(summerDrive)
    mockCommands({ read_cover: noCover, save_playlist: failingCommand(SAVE_ERROR) })
  },
  play: async ({ args, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    const dialog = await findEditDialog(canvasElement)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^Morning Star/ }))

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(page.getByText(`Couldn't save "Summer drive"`)).toBeVisible())
    await expect(page.getByText(SAVE_ERROR)).toBeVisible()
    await expect(args.onClose).not.toHaveBeenCalled()
    await expect(within(dialog).getByRole('checkbox', { name: /^Morning Star/ })).toBeChecked()
  }
}
