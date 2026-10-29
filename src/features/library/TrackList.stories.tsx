import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { SAMPLE_TRACKS } from './sampleTracks'
import { TrackList } from './TrackList'

const LONG_TITLE =
  'The Rage of the Waters (Live, Remastered and Extended Edition with the Bonus Orchestral Introduction)'

const meta = {
  component: TrackList,
  args: { tracks: SAMPLE_TRACKS }
} satisfies Meta<typeof TrackList>

export default meta
type Story = StoryObj<typeof meta>

/** A small library, one row per song, in the order the store sorted it. */
export const Default: Story = {
  play: async ({ canvas }) => {
    const list = canvas.getByRole('list', { name: 'Songs' })
    await expect(list.children).toHaveLength(SAMPLE_TRACKS.length)
  }
}

/** A title too long for its row is cut with an ellipsis; hovering the row shows it whole. */
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
    await expect(canvas.getByRole('listitem')).toHaveAttribute('title', LONG_TITLE)
  }
}
