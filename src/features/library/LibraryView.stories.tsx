import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { mockCommands } from '../../testing/mockCommands'
import { renderInOwnFrame } from '../../testing/storyParameters'
import { LibraryView } from './LibraryView'
import { useLibraryStore } from './libraryStore'
import { SAMPLE_TRACKS } from './sampleTracks'

const meta = {
  component: LibraryView,
  parameters: renderInOwnFrame(420),
  beforeEach: () => {
    mockCommands({
      load_music_library: () => SAMPLE_TRACKS,
      open_songs_folder: () => undefined
    })
  }
} satisfies Meta<typeof LibraryView>

export default meta
type Story = StoryObj<typeof meta>

/** The usual view: the header and the song list. */
export const Loaded: Story = {
  beforeEach: () => {
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: SAMPLE_TRACKS } })
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
