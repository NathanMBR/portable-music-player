import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent } from 'storybook/test'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import type { Track } from '../../library/types'
import { usePlaybackStore } from '../playbackStore'
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
 * song's length on its right.
 */
export const Midway: Story = {
  play: async ({ canvas }) => {
    const bar = canvas.getByRole('slider', { name: 'Song position' })
    await expect(bar).toBeEnabled()
    await expect(bar).toHaveAttribute('aria-valuetext', '01:23 of 04:30')
    await expect(canvas.getByRole('button', { name: 'Elapsed time 01:23' })).toBeVisible()
    await expect(canvas.getByText('04:30')).toBeVisible()
    await expect(canvas.queryByText('03:07')).not.toBeInTheDocument()
  }
}

/**
 * While a song's audio loads, its length is unknown: the bar stays empty and disabled, since there
 * is nowhere to jump to yet, and the length is dashes.
 */
export const UnknownLength: Story = {
  args: { elapsedSeconds: 0, durationSeconds: null },
  play: async ({ canvas }) => {
    const bar = canvas.getByRole('slider', { name: 'Song position' })
    await expect(bar).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Elapsed time 00:00' })).toBeVisible()
    await expect(canvas.getByText('--:--')).toBeVisible()
  }
}

/**
 * Clicking the elapsed time turns it into the time left, counted down, and clicking again turns it
 * back. The song's length stays on the right either way.
 */
export const TogglesToRemainingTime: Story = {
  parameters: renderInOwnFrame(80),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Elapsed time 01:23' }))
    await expect(canvas.getByRole('button', { name: 'Remaining time -03:07' })).toBeVisible()
    await expect(canvas.getByText('04:30')).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: 'Remaining time -03:07' }))
    await expect(canvas.getByRole('button', { name: 'Elapsed time 01:23' })).toBeVisible()
  }
}

/** Clicking or dragging the bar jumps within the song: the player's position moves there. */
export const SeeksWithinTheSong: Story = {
  parameters: renderInOwnFrame(80),
  beforeEach: () => {
    const track: Track = { path: 'Songs/Waiting Silence.mp3', title: 'Waiting Silence' }
    usePlaybackStore.setState({
      session: {
        track,
        queue: [track],
        playOrder: [track],
        isPlaying: true,
        elapsedSeconds: 83,
        durationSeconds: 270
      }
    })
  },
  play: async ({ canvas }) => {
    fireEvent.change(canvas.getByRole('slider', { name: 'Song position' }), {
      target: { value: '200' }
    })

    await expect(usePlaybackStore.getState().session?.elapsedSeconds).toBe(200)
  }
}
