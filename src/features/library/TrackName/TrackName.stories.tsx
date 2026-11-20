import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { TrackName } from './TrackName'

const meta = {
  component: TrackName,
  args: { track: { path: 'Songs/Rough Stone.mp3', title: 'Rough Stone', artist: 'Shaman' } }
} satisfies Meta<typeof TrackName>

export default meta
type Story = StoryObj<typeof meta>

/** The title, then a middle dot and the artist in a lighter ink. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByTitle('Rough Stone · Shaman')).toHaveTextContent(
      'Rough Stone · Shaman'
    )
  }
}

/** A song whose tags name no artist shows its title alone. */
export const WithoutArtist: Story = {
  args: { track: { path: 'Songs/Rough Stone.mp3', title: 'Rough Stone', artist: null } },
  play: async ({ canvas }) => {
    await expect(canvas.getByTitle('Rough Stone')).toHaveTextContent(/^Rough Stone$/)
  }
}

/** In the row of the song in the player, the artist is in the row's pen, like the title. */
export const InThePlayer: Story = {
  args: { isInPlayer: true },
  decorators: [
    Story => (
      <div className="bg-pen/15 text-pen">
        <Story />
      </div>
    )
  ]
}
