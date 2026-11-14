import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { useLibraryStore } from '../libraryStore'
import type { Track } from '../types'
import { LibraryStatus } from './LibraryStatus'

const TRACKS: Track[] = [
  { path: 'Songs/CUBErt.mp3', title: 'CUBErt', artist: 'System of a Down' },
  { path: 'Songs/Cure.mp3', title: 'Cure', artist: 'Metallica' },
  { path: 'Songs/Attack.mp3', title: 'Attack', artist: 'System of a Down' }
]

const meta = {
  component: LibraryStatus,
  parameters: renderInOwnFrame(80)
} satisfies Meta<typeof LibraryStatus>

export default meta
type Story = StoryObj<typeof meta>

/** After a scan that found songs, it counts them. */
export const CountingSongs: Story = {
  beforeEach: () => {
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: TRACKS } })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent(`${TRACKS.length} songs`)
  }
}

/** While a scan runs, even with the songs of an earlier one listed, it says so. */
export const Scanning: Story = {
  beforeEach: () => {
    useLibraryStore.setState({
      lastScan: { kind: 'loaded', tracks: TRACKS },
      isScanning: true
    })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Scanning…')
  }
}

/** The Songs folder has no songs: it says nothing, since the notice below it explains. */
export const NothingWithoutSongs: Story = {
  beforeEach: () => {
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: [] } })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toBeEmptyDOMElement()
  }
}

/** The scan failed: it says nothing, since the notice below it explains. */
export const NothingAfterAFailedScan: Story = {
  beforeEach: () => {
    useLibraryStore.setState({ lastScan: { kind: 'failed' } })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toBeEmptyDOMElement()
  }
}
