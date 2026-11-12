import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import type { Track } from '../../library/types'
import { usePlaybackStore } from '../playbackStore'
import { PlayButton } from './PlayButton'

const track: Track = { path: 'Songs/Vida Seca.mp3', title: 'Vida Seca', artist: 'Angra' }
const otherTrack: Track = {
  path: 'Songs/Extreme Dream.mp3',
  title: 'Extreme Dream',
  artist: 'Angra'
}
const queue = [track, otherTrack]

const meta = {
  component: PlayButton,
  args: { track, queue }
} satisfies Meta<typeof PlayButton>

export default meta
type Story = StoryObj<typeof meta>

/** The song isn't playing: the button offers to play it. */
export const Idle: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: `Play ${track.title}` })).toBeVisible()
  }
}

/**
 * The song is playing: the button stays pressed, with the same highlight as the player's toggles,
 * and shows a pause icon that offers to pause it.
 */
export const Playing: Story = {
  parameters: renderInOwnFrame(80),
  beforeEach: () => {
    usePlaybackStore.setState({
      session: {
        track,
        queue,
        playOrder: queue,
        isPlaying: true,
        elapsedSeconds: 0,
        durationSeconds: null
      }
    })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: `Pause ${track.title}` })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  }
}

/** Playing the song loads it in the audio player, with the list it's in as the queue. */
export const PlaysWithItsListAsTheQueue: Story = {
  parameters: renderInOwnFrame(80),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: `Play ${track.title}` }))

    await expect(usePlaybackStore.getState().session).toMatchObject({ track, queue })
  }
}

/** Clicking the button plays the song, clicking it again pauses it, and once more resumes it. */
export const PausesAndResumes: Story = {
  parameters: renderInOwnFrame(80),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: `Play ${track.title}` }))
    await userEvent.click(canvas.getByRole('button', { name: `Pause ${track.title}` }))
    await expect(usePlaybackStore.getState().session?.isPlaying).toBe(false)
    await expect(canvas.getByRole('button', { name: `Play ${track.title}` })).toHaveAttribute(
      'aria-pressed',
      'false'
    )

    await userEvent.click(canvas.getByRole('button', { name: `Play ${track.title}` }))
    await expect(canvas.getByRole('button', { name: `Pause ${track.title}` })).toBeVisible()
  }
}
