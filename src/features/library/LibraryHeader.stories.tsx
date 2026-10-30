import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { failingCommand, mockCommands } from '../../testing/mockCommands'
import { renderInOwnFrame } from '../../testing/storyParameters'
import { withNotificationArea } from '../../testing/withNotificationArea'
import { LibraryHeader } from './LibraryHeader'
import { useLibraryStore } from './libraryStore'
import type { Track } from './types'

const TRACKS: Track[] = [
  { path: 'Songs/Gate XIII.mp3', title: 'Gate XIII' },
  { path: 'Songs/Heroes of Sand.mp3', title: 'Heroes of Sand' },
  { path: 'Songs/Holy Land.mp3', title: 'Holy Land' },
  { path: 'Songs/The Rage of the Waters.mp3', title: 'The Rage of the Waters' },
  { path: 'Songs/Weakness of a Man.mp3', title: 'Weakness of a Man' }
]

const OPEN_FOLDER_ERROR = "Couldn't open the Songs folder: no application can open folders"

const meta = {
  component: LibraryHeader,
  parameters: renderInOwnFrame(180),
  beforeEach: () => {
    mockCommands({
      load_music_library: () => TRACKS,
      open_songs_folder: () => undefined
    })
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: TRACKS } })
  }
} satisfies Meta<typeof LibraryHeader>

export default meta
type Story = StoryObj<typeof meta>

/** After a scan, the status line counts the songs. */
export const Loaded: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText(`${TRACKS.length} songs`)).toBeVisible()
  }
}

/** While a scan runs, the status line says so and the "Scan again" icon spins. */
export const Scanning: Story = {
  beforeEach: () => {
    useLibraryStore.setState({ isScanning: true })
  }
}

/** After a failed scan the status line reports it; the view below shows the details. */
export const ScanFailed: Story = {
  beforeEach: () => {
    useLibraryStore.setState({ lastScan: { kind: 'failed' } })
  }
}

/** When the file manager can't open the Songs folder, a notification says why. */
export const OpenFolderFails: Story = {
  parameters: renderInOwnFrame(260),
  decorators: [withNotificationArea],
  beforeEach: () => {
    mockCommands({ open_songs_folder: failingCommand(OPEN_FOLDER_ERROR) })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', { name: 'Open folder' }))

    await waitFor(() => expect(page.getByText(OPEN_FOLDER_ERROR)).toBeVisible())
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument()
  }
}
