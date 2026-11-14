import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, waitFor, within } from 'storybook/test'
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

/** Muted: the slider shows silent and the speaker is crossed out, and clicking it unmutes. */
export const Muted: Story = {
  beforeEach: () => {
    usePlaybackStore.setState({ volume: 0.6, isMuted: true })
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

/**
 * While the slider is dragged, the song plays at once at the volume it's on, but the player's
 * volume is chosen only once the slider is released.
 */
export const HearsTheVolumeWhileMoving: Story = {
  beforeEach: () => {
    usePlaybackStore.setState({ volume: 0.6 })
  },
  play: async ({ canvas }) => {
    const slider = canvas.getByRole('slider', { name: 'Volume' })

    fireEvent.input(slider, { target: { value: '30' } })
    await expect(usePlaybackStore.getState()).toMatchObject({ volume: 0.6, movingVolume: 0.3 })
    await expect(slider).toHaveAttribute('aria-valuetext', '30%')

    fireEvent.change(slider, { target: { value: '30' } })
    await expect(usePlaybackStore.getState()).toMatchObject({ volume: 0.3, movingVolume: null })
  }
}

/**
 * Released at silent, the slider mutes instead of choosing a volume of 0%, so unmuting brings
 * back the volume from before the drag.
 */
export const ReleasingAtSilentMutes: Story = {
  beforeEach: () => {
    usePlaybackStore.setState({ volume: 0.6 })
  },
  play: async ({ canvas, userEvent }) => {
    const slider = canvas.getByRole('slider', { name: 'Volume' })

    fireEvent.input(slider, { target: { value: '0' } })
    fireEvent.change(slider, { target: { value: '0' } })
    await expect(usePlaybackStore.getState()).toMatchObject({ volume: 0.6, isMuted: true })
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

// How far the tooltip keeps from the window's edges.
const COLLISION_PADDING = 8

/**
 * The mouse over the slider shows at once, in a tooltip above it, the volume a click there would
 * set. At the slider's right end, as close to the window's edge as in the player, the tooltip
 * shifts to stay inside the window, and its arrow moves to keep pointing at the mouse.
 */
export const HoveringShowsTheVolumeAClickSets: Story = {
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className="flex justify-end py-12 pr-6">
        <Story />
      </div>
    )
  ],
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    const slider = canvas.getByRole('slider', { name: 'Volume' })
    const track = slider.getBoundingClientRect()
    const pointerX = track.right - 1

    await userEvent.pointer({
      target: slider,
      coords: { clientX: pointerX, clientY: track.top + track.height / 2 }
    })

    const tooltip = page.getByText('100%')
    await expect(tooltip).toBeVisible()
    const windowWidth = canvasElement.ownerDocument.documentElement.clientWidth
    // Retried: the tooltip may first show in the fallback font, and moves once the app's font loads.
    await waitFor(async () => {
      await expect(tooltip.getBoundingClientRect().right).toBeCloseTo(
        windowWidth - COLLISION_PADDING,
        0
      )
      const arrow = tooltip.parentElement?.querySelector('svg')?.getBoundingClientRect()
      await expect(arrow && arrow.left + arrow.width / 2).toBeCloseTo(pointerX, 0)
    })
  }
}
