import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { renderInOwnFrame } from '../../testing/storyParameters'
import { SongProgress } from './SongProgress'

const meta = {
  component: SongProgress,
  args: { elapsedSeconds: 83, durationSeconds: 270 },
  // About as wide as the middle of the audio player.
  decorators: [
    Story => (
      <div className="w-md">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof SongProgress>

export default meta
type Story = StoryObj<typeof meta>

/**
 * 1:23 into a 4:30 song: the bar is a third full, with the elapsed time on its left and the
 * remaining time on its right.
 */
export const Midway: Story = {
  play: async ({ canvas }) => {
    const bar = canvas.getByRole('progressbar', { name: 'Song progress' })
    await expect(bar).toHaveAttribute('aria-valuenow', '83')
    await expect(bar).toHaveAttribute('aria-valuetext', '01:23 of 04:30')
    await expect(canvas.getByRole('button', { name: 'Elapsed time 01:23' })).toBeVisible()
    await expect(canvas.getByText('03:07')).toBeVisible()
  }
}

/**
 * What every song shows until real audio arrives: its length is unknown, so the bar stays empty
 * and the remaining time is dashes.
 */
export const UnknownLength: Story = {
  args: { elapsedSeconds: 0, durationSeconds: null },
  play: async ({ canvas }) => {
    const bar = canvas.getByRole('progressbar', { name: 'Song progress' })
    await expect(bar).not.toHaveAttribute('aria-valuenow')
    await expect(canvas.getByRole('button', { name: 'Elapsed time 00:00' })).toBeVisible()
    await expect(canvas.getByText('--:--')).toBeVisible()
  }
}

/** Clicking the elapsed time turns it into the time left, counted down; clicking again turns it back. */
export const TogglesToRemainingTime: Story = {
  parameters: renderInOwnFrame(80),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Elapsed time 01:23' }))
    await expect(canvas.getByRole('button', { name: 'Remaining time -03:07' })).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: 'Remaining time -03:07' }))
    await expect(canvas.getByRole('button', { name: 'Elapsed time 01:23' })).toBeVisible()
  }
}
