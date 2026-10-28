import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { failingCommand, mockCommands } from '../../testing/mockCommands'
import { renderInOwnFrame } from '../../testing/storyParameters'
import { LibraryHeader } from './LibraryHeader'
import { useLibraryStore } from './libraryStore'
import { SAMPLE_TRACKS } from './sampleTracks'

const OPEN_FOLDER_ERROR = "Couldn't open the Songs folder: no application can open folders"

const meta = {
  component: LibraryHeader,
  tags: ['ai-generated'],
  parameters: renderInOwnFrame(180),
  beforeEach: () => {
    mockCommands({
      load_music_library: () => SAMPLE_TRACKS,
      open_songs_folder: () => undefined
    })
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: SAMPLE_TRACKS } })
  }
} satisfies Meta<typeof LibraryHeader>

export default meta
type Story = StoryObj<typeof meta>

/** After a scan, the status line counts the songs. */
export const Loaded: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText(`${SAMPLE_TRACKS.length} songs`)).toBeVisible()
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
    useLibraryStore.setState({
      lastScan: { kind: 'failed', message: "Couldn't read the Songs folder" }
    })
  }
}

/** When the file manager can't open the Songs folder, the reason shows under the status line. */
export const OpenFolderFails: Story = {
  beforeEach: () => {
    mockCommands({ open_songs_folder: failingCommand(OPEN_FOLDER_ERROR) })
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open folder' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(OPEN_FOLDER_ERROR)
  }
}
