import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import type { Track } from '../../library/types'
import { type PlaybackSource, playlistSource, SONGS_SOURCE } from '../playbackSource'
import { usePlaybackStore } from '../playbackStore'
import { PlayButton } from './PlayButton'

const track: Track = { path: 'Songs/Vida Seca.mp3', title: 'Vida Seca', artist: 'Angra' }
const otherTrack: Track = {
  path: 'Songs/Extreme Dream.mp3',
  title: 'Extreme Dream',
  artist: 'Angra'
}
const queue = [track, otherTrack]

/** The song in the player, playing, from `source`. */
const playingTheSongFrom = (source: PlaybackSource) => {
  usePlaybackStore.setState({
    session: {
      track,
      queue,
      playOrder: queue,
      isPlaying: true,
      elapsedSeconds: 0,
      durationSeconds: null,
      source
    }
  })
}

/** The song in the player, playing, from the Songs view the button's stories play it from. */
const playingTheSong = () => playingTheSongFrom(SONGS_SOURCE)

const meta = {
  component: PlayButton,
  args: { track, source: SONGS_SOURCE, onPlay: fn() }
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

/**
 * The song plays from another list, like a playlist, than the button's: the button doesn't show it
 * playing, and plays it from its own list, the way that list says, instead of pausing it.
 */
export const PlayingFromAnotherList: Story = {
  parameters: renderInOwnFrame(80),
  beforeEach: () => playingTheSongFrom(playlistSource('1763600022222-Sunday_morning.json')),
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: `Play ${track.title}` })
    await expect(button).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(button)

    await expect(args.onPlay).toHaveBeenCalledOnce()
    await expect(usePlaybackStore.getState().session?.isPlaying).toBe(true)
  }
}

/** A song that can't be played right now, like in a playlist whose songs aren't all found. */
export const Disabled: Story = {
  args: { isDisabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: `Play ${track.title}` })).toBeDisabled()
  }
}
