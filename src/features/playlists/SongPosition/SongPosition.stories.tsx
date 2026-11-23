import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { SongPosition } from './SongPosition'

const meta = {
  component: SongPosition,
  args: { position: 7, songCount: 12 }
} satisfies Meta<typeof SongPosition>

export default meta
type Story = StoryObj<typeof meta>

/** A short position in a long playlist keeps the room of the longest one, like 7 of 12. */
export const Default: Story = {}

/** The positions of a playlist's rows, right-aligned, so what follows them lines up. */
export const InAColumn: Story = {
  render: () => (
    <div className="flex flex-col">
      {[1, 9, 10, 12].map(position => (
        <div key={position} className="flex gap-2">
          <SongPosition position={position} songCount={12} />
          <span className="text-sm text-ink">·</span>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    const rightEdges = ['1', '9', '10', '12'].map(
      position => canvas.getByText(position).getBoundingClientRect().right
    )

    await expect(new Set(rightEdges).size).toBe(1)
  }
}
