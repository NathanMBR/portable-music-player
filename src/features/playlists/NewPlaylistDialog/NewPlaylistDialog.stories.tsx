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
import type { SavedPlaylist } from '../types'
import { NewPlaylistDialog } from './NewPlaylistDialog'

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

const songNamesIn = (dialog: HTMLElement) =>
  within(dialog)
    .queryAllByRole('checkbox')
    .map(checkbox => checkbox.textContent)

const meta = {
  component: NewPlaylistDialog,
  args: { isOpen: true, onClose: fn() },
  decorators: [withNotificationArea],
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(720) },
  beforeEach: () => {
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: TRACKS } })
    mockCommands({ read_cover: noCover, create_playlist: createPlaylist })
  }
} satisfies Meta<typeof NewPlaylistDialog>

export default meta
type Story = StoryObj<typeof meta>

/** The empty form: the songs in the Songs view's order, none picked, and Save disabled. */
export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog', {
      name: 'New playlist'
    })
    await expect(songNamesIn(dialog)).toEqual([
      'Boat Song · Woodkid',
      'Carpe Diem Baby · Metallica',
      'Drawn to You · Woodkid',
      'Leper Messiah · Metallica',
      'Morning Star · Angra',
      'Winds of Destination · Angra'
    ])
    await expect(within(dialog).getByText('0 songs picked')).toBeVisible()
    await expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
  }
}

/** Save turns on once the title isn't blank: spaces alone aren't a title. */
export const SaveNeedsATitle: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog')
    const title = within(dialog).getByRole('textbox', { name: 'Title' })
    const save = within(dialog).getByRole('button', { name: 'Save' })

    await userEvent.type(title, '   ')
    await expect(save).toBeDisabled()

    await userEvent.type(title, 'Road trip')
    await expect(save).toBeEnabled()
  }
}

/** The search finds songs by their title, their artist or their file name. */
export const Searching: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog')
    const search = within(dialog).getByRole('searchbox', { name: 'Search songs' })

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
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog')

    await userEvent.type(within(dialog).getByRole('searchbox'), 'WÓODKID')

    await expect(songNamesIn(dialog)).toEqual(['Boat Song · Woodkid', 'Drawn to You · Woodkid'])
  }
}

/** A search that finds nothing says so. */
export const NothingFound: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog')

    await userEvent.type(within(dialog).getByRole('searchbox'), 'Audioslave')

    await expect(within(dialog).getByText('No songs match "Audioslave".')).toBeVisible()
  }
}

/** Picked songs stay picked while the search hides them, and the count below the list says so. */
export const KeepsPickedSongsWhileSearching: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog')
    const search = within(dialog).getByRole('searchbox')
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
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Title' }), ' Road trip ')
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Description' }),
      'For the long drive'
    )
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
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Title' }), 'Road trip')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(args.onClose).toHaveBeenCalledOnce())
    await expect(createPlaylist).toHaveBeenCalledWith(
      expect.objectContaining({ playlist: expect.objectContaining({ songs: [] }) })
    )
  }
}

/** When the file can't be written, the dialog stays open with what was typed, and a notification says why. */
export const SaveFailing: Story = {
  beforeEach: () => {
    mockCommands({ read_cover: noCover, create_playlist: failingCommand(TAKEN_ERROR) })
  },
  play: async ({ args, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    const dialog = await page.findByRole('dialog')
    const title = within(dialog).getByRole('textbox', { name: 'Title' })
    await userEvent.type(title, 'Road trip')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(page.getByText(TAKEN_ERROR)).toBeVisible())
    await expect(args.onClose).not.toHaveBeenCalled()
    await expect(title).toHaveValue('Road trip')
    await expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
  }
}

/** Cancel closes the dialog without writing anything. */
export const Cancelling: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog')
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
  play: async ({ canvasElement }) => {
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog')
    await expect(within(dialog).getByText('The Songs folder has no songs yet.')).toBeVisible()
  }
}
