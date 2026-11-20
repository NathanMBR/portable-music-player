import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { noCover } from '../../../testing/covers'
import { mockCommands } from '../../../testing/mockCommands'
import type { Track } from '../types'
import { TrackRow } from './TrackRow'

const track: Track = { path: 'Songs/Carry On.mp3', title: 'Carry On', artist: 'Angra' }

const meta = {
  component: TrackRow,
  args: { track, onPlay: fn() },
  // Rows are list items, so they need a list around them.
  decorators: [
    Story => (
      <ul>
        <Story />
      </ul>
    )
  ],
  beforeEach: () => {
    mockCommands({ read_cover: noCover })
  }
} satisfies Meta<typeof TrackRow>

export default meta
type Story = StoryObj<typeof meta>

/** A song's play button, its cover, then its title and artist. Its play plays it as its list says. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: `Play ${track.title}` }))

    await expect(args.onPlay).toHaveBeenCalledOnce()
  }
}

/** A song without an artist in its tags shows its title alone. */
export const WithoutArtist: Story = {
  args: { track: { path: 'Songs/Deus Le Volt!.mp3', title: 'Deus Le Volt!', artist: null } },
  play: async ({ canvas }) => {
    await expect(canvas.getByTitle('Deus Le Volt!')).toHaveTextContent(/^Deus Le Volt!$/)
  }
}
