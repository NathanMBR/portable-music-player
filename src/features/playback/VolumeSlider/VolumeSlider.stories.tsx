import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent } from 'storybook/test'
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

/** Clicking the slider moves the volume without a focus ring, which only keyboard users need. */
export const ClickedWithoutFocusRing: Story = {
  play: async ({ canvas, userEvent }) => {
    const slider = canvas.getByRole('slider', { name: 'Volume' })

    await userEvent.click(slider)

    await expect(slider).toHaveFocus()
    await expect(getComputedStyle(slider).outlineStyle).toBe('none')
  }
}

/** Reaching the slider with Tab rings it in pen, so keyboard users see where they are. */
export const FocusedFromTheKeyboard: Story = {
  play: async ({ canvas, userEvent }) => {
    const slider = canvas.getByRole('slider', { name: 'Volume' })

    // The speaker button comes first.
    await userEvent.tab()
    await userEvent.tab()

    await expect(slider).toHaveFocus()
    await expect(getComputedStyle(slider).outlineStyle).toBe('solid')
  }
}
