import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { renderInOwnFrame } from '../../testing/storyParameters'
import { TrackList } from './TrackList'
import type { Track } from './types'

const TRACKS: Track[] = [
  { path: 'Songs/Crossing.mp3', title: 'Crossing' },
  { path: 'Songs/Metal Icarus.mp3', title: 'Metal Icarus' },
  { path: 'Songs/Morning Star.mp3', title: 'Morning Star' },
  { path: 'Songs/Mystery Machine.mp3', title: 'Mystery Machine' },
  { path: 'Songs/Weakness of a Man.mp3', title: 'Weakness of a Man' }
]

const LONG_TITLE =
  'The Rage of the Waters (Live, Remastered and Extended Edition with the Bonus Orchestral Introduction)'

const firstTrack: Track = { path: 'Songs/Nova Era.mp3', title: 'Nova Era' }
const secondTrack: Track = { path: 'Songs/Rebirth.mp3', title: 'Rebirth' }

const meta = {
  component: TrackList,
  args: { tracks: TRACKS }
} satisfies Meta<typeof TrackList>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A small library, one row per song, in the order the store sorted it. Each row starts with a
 * round play button named after its song.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    const list = canvas.getByRole('list', { name: 'Songs' })
    await expect(list.children).toHaveLength(TRACKS.length)
    for (const track of TRACKS) {
      await expect(canvas.getByRole('button', { name: `Play ${track.title}` })).toBeVisible()
    }
  }
}

/**
 * Playing a song while another is playing switches to it: only one row at a time shows the pause
 * button.
 */
export const SwitchingSongs: Story = {
  args: { tracks: [firstTrack, secondTrack] },
  parameters: renderInOwnFrame(150),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: `Play ${firstTrack.title}` }))
    await userEvent.click(canvas.getByRole('button', { name: `Play ${secondTrack.title}` }))

    const pauseButtons = canvas.getAllByRole('button', { name: /^Pause / })
    await expect(pauseButtons).toHaveLength(1)
    await expect(pauseButtons[0]).toHaveAccessibleName(`Pause ${secondTrack.title}`)
  }
}

/** A title too long for its row is cut with an ellipsis; hovering the title shows it whole. */
export const LongTitle: Story = {
  args: { tracks: [{ path: `Songs/${LONG_TITLE}.mp3`, title: LONG_TITLE }] },
  decorators: [
    Story => (
      <div className="max-w-xs">
        <Story />
      </div>
    )
  ],
  play: async ({ canvas }) => {
    await expect(canvas.getByText(LONG_TITLE)).toHaveAttribute('title', LONG_TITLE)
  }
}
