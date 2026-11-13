import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent } from 'storybook/test'
import { loggedMessages } from '../../../testing/logs'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { usePlaybackStore } from '../playbackStore'
import { VolumeSlider } from './VolumeSlider'

const meta = {
  component: VolumeSlider,
  parameters: renderInOwnFrame(60)
} satisfies Meta<typeof VolumeSlider>

export default meta
type Story = StoryObj<typeof meta>

/** Full volume, where the player starts. */
export const Full: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('slider', { name: 'Volume' })).toHaveAttribute(
      'aria-valuetext',
      '100%'
    )
  }
}

/** Silent: the speaker is crossed out, and clicking it unmutes. */
export const Muted: Story = {
  beforeEach: () => {
    usePlaybackStore.setState({ volume: 0 })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('slider', { name: 'Volume' })).toHaveAttribute(
      'aria-valuetext',
      '0%'
    )
    await expect(canvas.getByRole('button', { name: 'Unmute' })).toBeVisible()
  }
}

/** Clicking the speaker silences the volume, and clicking it again brings the volume back. */
export const MutesAndUnmutes: Story = {
  beforeEach: () => {
    usePlaybackStore.setState({ volume: 0.6 })
  },
  play: async ({ canvas, userEvent }) => {
    const slider = canvas.getByRole('slider', { name: 'Volume' })

    await userEvent.click(canvas.getByRole('button', { name: 'Mute' }))
    await expect(slider).toHaveAttribute('aria-valuetext', '0%')

    await userEvent.click(canvas.getByRole('button', { name: 'Unmute' }))
    await expect(slider).toHaveAttribute('aria-valuetext', '60%')
  }
}

/** Moving the slider sets the player's volume. */
export const ChangesTheVolume: Story = {
  play: async ({ canvas }) => {
    const slider = canvas.getByRole('slider', { name: 'Volume' })

    fireEvent.change(slider, { target: { value: '40' } })

    await expect(usePlaybackStore.getState().volume).toBe(0.4)
    await expect(slider).toHaveAttribute('aria-valuetext', '40%')
  }
}

/** The mouse wheel over the slider turns the volume up or down by 5%. */
export const ChangesTheVolumeWithTheWheel: Story = {
  beforeEach: () => {
    usePlaybackStore.setState({ volume: 0.6 })
  },
  play: async ({ canvas }) => {
    const slider = canvas.getByRole('slider', { name: 'Volume' })

    fireEvent.wheel(slider, { deltaY: 100 })
    await expect(usePlaybackStore.getState().volume).toBe(0.55)

    fireEvent.wheel(slider, { deltaY: -100 })
    fireEvent.wheel(slider, { deltaY: -100 })
    await expect(slider).toHaveAttribute('aria-valuetext', '65%')
  }
}

/**
 * The log gets the volume a move ends on, in percent: once a drag is released, not at every step,
 * and at each turn of the wheel.
 */
export const LogsTheVolumeSet: Story = {
  play: async ({ canvas }) => {
    const slider = canvas.getByRole('slider', { name: 'Volume' })

    fireEvent.input(slider, { target: { value: '55' } })
    fireEvent.change(slider, { target: { value: '70' } })
    fireEvent.wheel(slider, { deltaY: -100 })

    await expect(loggedMessages()).toEqual(['Set volume to 70%', 'Set volume to 75%'])
  }
}
