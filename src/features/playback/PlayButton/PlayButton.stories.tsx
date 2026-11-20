import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
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

/** The song in the player, playing. */
const playingTheSong = () => {
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
}

const meta = {
  component: PlayButton,
  args: { track, onPlay: fn() }
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
  beforeEach: playingTheSong,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: `Pause ${track.title}` })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  }
}

/** A song that isn't in the player plays the way its list says. */
export const PlaysTheWayItsListSays: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: `Play ${track.title}` }))

    await expect(args.onPlay).toHaveBeenCalledOnce()
  }
}

/**
 * Clicking the song in the player pauses it, and once more resumes it, without playing it again
 * from the start.
 */
export const PausesAndResumes: Story = {
  parameters: renderInOwnFrame(80),
  beforeEach: playingTheSong,
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: `Pause ${track.title}` }))
    await expect(usePlaybackStore.getState().session?.isPlaying).toBe(false)
    await expect(canvas.getByRole('button', { name: `Play ${track.title}` })).toHaveAttribute(
      'aria-pressed',
      'false'
    )

    await userEvent.click(canvas.getByRole('button', { name: `Play ${track.title}` }))
    await expect(canvas.getByRole('button', { name: `Pause ${track.title}` })).toBeVisible()
    await expect(args.onPlay).not.toHaveBeenCalled()
  }
}

/** A song that can't be played right now, like in a playlist whose songs aren't all found. */
export const Disabled: Story = {
  args: { isDisabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: `Play ${track.title}` })).toBeDisabled()
  }
}
