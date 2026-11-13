import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { noCover } from '../../../testing/covers'
import { mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { useLibraryStore } from '../libraryStore'
import type { Track } from '../types'
import { LibraryView } from './LibraryView'

const TRACKS: Track[] = [
  { path: 'Songs/Metal Icarus.mp3', title: 'Metal Icarus', artist: 'Angra' },
  { path: 'Songs/Millennium Sun.mp3', title: 'Millennium Sun', artist: 'Angra' },
  { path: 'Songs/No Pain for the Dead.mp3', title: 'No Pain for the Dead', artist: 'Angra' },
  { path: 'Songs/Nothing To Say.mp3', title: 'Nothing To Say', artist: 'Angra' },
  { path: 'Songs/The Temple of Hate.mp3', title: 'The Temple of Hate', artist: 'Angra' }
]

const meta = {
  component: LibraryView,
  parameters: renderInOwnFrame(420),
  beforeEach: () => {
    mockCommands({
      load_music_library: () => TRACKS,
      open_songs_folder: () => undefined,
      read_cover: noCover
    })
  }
} satisfies Meta<typeof LibraryView>

export default meta
type Story = StoryObj<typeof meta>

/** The usual view: the header and the song list. */
export const Loaded: Story = {
  beforeEach: () => {
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: TRACKS } })
  }
}

/** Until the first scan finishes, only the header shows, so nothing flashes on launch. */
export const BeforeFirstScan: Story = {}

/** No songs in the Songs folder yet: the view tells the user where to put them. */
export const Empty: Story = {
  beforeEach: () => {
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: [] } })
  }
}

/**
 * The scan failed: a notification gave Rust's reason, the view offers "Try again", and trying again
 * brings the songs back.
 */
export const ScanFailed: Story = {
  beforeEach: () => {
    useLibraryStore.setState({ lastScan: { kind: 'failed' } })
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }))
    await expect(await canvas.findByRole('list', { name: 'Songs' })).toBeVisible()
  }
}
