import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { noCover } from '../../../testing/covers'
import { mockCommands } from '../../../testing/mockCommands'
import { PlaylistSongLabel } from './PlaylistSongLabel'

const meta = {
  component: PlaylistSongLabel,
  args: {
    song: {
      fileName: 'Running Alone.mp3',
      track: { path: 'Songs/Running Alone.mp3', title: 'Running Alone', artist: 'Angra' }
    }
  },
  decorators: [
    Story => (
      <div className="flex w-72 items-center gap-2">
        <Story />
      </div>
    )
  ],
  beforeEach: () => {
    mockCommands({ read_cover: noCover })
  }
} satisfies Meta<typeof PlaylistSongLabel>

export default meta
type Story = StoryObj<typeof meta>

/** A song the last scan found: its cover, then its title and artist. */
export const Found: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toHaveTextContent('Running Alone · Angra')
  }
}

/**
 * A song the last scan lacks: the placeholder where its cover goes, and its file name without the
 * extension, in a lighter ink.
 */
export const Missing: Story = {
  args: { song: { fileName: 'The Great Escape.mp3', track: null } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('The Great Escape')).toHaveClass('text-ink-faded')
  }
}
