import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { usePlaybackStore } from '../playbackStore'
import { PlaybackControls } from './PlaybackControls'

const meta = {
  component: PlaybackControls,
  args: { isPlaying: true, hasPreviousSong: true, hasNextSong: true }
} satisfies Meta<typeof PlaybackControls>

export default meta
type Story = StoryObj<typeof meta>

/** A song is playing: the main button, a pen-filled disc, pauses it. */
export const Playing: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Pause' })).toBeVisible()
  }
}

/** The song is paused: the main button plays it again. */
export const Paused: Story = {
  args: { isPlaying: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Play' })).toBeVisible()
  }
}

/** The last song of the queue with repeat off has no song after it, so "Next song" is disabled. */
export const AtTheLastSong: Story = {
  args: { hasNextSong: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Next song' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Previous song' })).toBeEnabled()
  }
}

/** Repeat one: the repeat button is on and carries a small 1. */
export const RepeatOne: Story = {
  parameters: renderInOwnFrame(80),
  beforeEach: () => {
    usePlaybackStore.setState({ repeatMode: 'one' })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Repeat one' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  }
}

/** The repeat button cycles from off to all to one, then back to off. */
export const CyclesRepeatModes: Story = {
  parameters: renderInOwnFrame(80),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('button', { name: 'Repeat off' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )

    await userEvent.click(canvas.getByRole('button', { name: 'Repeat off' }))
    await expect(canvas.getByRole('button', { name: 'Repeat all' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    await userEvent.click(canvas.getByRole('button', { name: 'Repeat all' }))
    await expect(canvas.getByRole('button', { name: 'Repeat one' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    await userEvent.click(canvas.getByRole('button', { name: 'Repeat one' }))
    await expect(canvas.getByRole('button', { name: 'Repeat off' })).toBeVisible()
  }
}

/** The shuffle button turns shuffle on, and off again. */
export const TogglesShuffle: Story = {
  parameters: renderInOwnFrame(80),
  play: async ({ canvas, userEvent }) => {
    const shuffleButton = canvas.getByRole('button', { name: 'Shuffle' })

    await userEvent.click(shuffleButton)
    await expect(shuffleButton).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(shuffleButton)
    await expect(shuffleButton).toHaveAttribute('aria-pressed', 'false')
  }
}
