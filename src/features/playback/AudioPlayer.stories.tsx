import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
import { renderInOwnFrame } from '../../testing/storyParameters'
import type { Track } from '../library/types'
import { AudioPlayer } from './AudioPlayer'
import { type PlaybackSession, usePlaybackStore } from './playbackStore'

const firstTrack: Track = { path: 'Songs/Angels and Demons.mp3', title: 'Angels and Demons' }
const secondTrack: Track = {
  path: 'Songs/A Monster in Her Eyes.mp3',
  title: 'A Monster in Her Eyes'
}
const thirdTrack: Track = { path: 'Songs/Silence and Distance.mp3', title: 'Silence and Distance' }
const queue = [firstTrack, secondTrack, thirdTrack]

const LONG_TITLE =
  'Deus Le Volt! (Live in São Paulo, Remastered with the Full Orchestral Prelude and a Bonus Reprise)'

/** The second song of the queue, playing 1:23 into its 4:30, unless overridden. */
const loadSession = (overrides: Partial<PlaybackSession> = {}) => {
  usePlaybackStore.setState({
    session: {
      track: secondTrack,
      queue,
      playOrder: queue,
      isPlaying: true,
      elapsedSeconds: 83,
      durationSeconds: 270,
      ...overrides
    }
  })
}

const meta = {
  component: AudioPlayer,
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(120) }
} satisfies Meta<typeof AudioPlayer>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A song is playing: the controls on the left, its title above the progress bar in the middle,
 * and the volume on the right.
 */
export const Playing: Story = {
  beforeEach: () => {
    loadSession()
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('region', { name: 'Player' })).toBeVisible()
    await expect(canvas.getByText(secondTrack.title)).toBeVisible()
  }
}

/** The song is paused: the main button plays it again. */
export const Paused: Story = {
  beforeEach: () => {
    loadSession({ isPlaying: false })
  }
}

/**
 * What the app shows until real audio arrives: the song's length is unknown, so the bar stays
 * empty and the remaining time is dashes.
 */
export const UnknownLength: Story = {
  beforeEach: () => {
    loadSession({ elapsedSeconds: 0, durationSeconds: null })
  }
}

/** A title too long for the player is cut with an ellipsis. */
export const LongTitle: Story = {
  beforeEach: () => {
    const longTrack: Track = { path: `Songs/${LONG_TITLE}.mp3`, title: LONG_TITLE }
    loadSession({ track: longTrack, queue: [longTrack], playOrder: [longTrack] })
  },
  play: async ({ canvas }) => {
    const title = canvas.getByText(LONG_TITLE)
    await expect(getComputedStyle(title).textOverflow).toBe('ellipsis')
    await expect(title).not.toHaveAttribute('title')
  }
}

/**
 * In a wide window the song's progress stops growing at a set width, and the spaces on either side
 * of it widen equally instead, so the bar stays easy to follow.
 */
export const WideWindow: Story = {
  parameters: {
    viewport: {
      options: {
        wideWindow: { name: 'Wide window', styles: { width: '1920px', height: '1080px' } }
      }
    }
  },
  globals: { viewport: { value: 'wideWindow' } },
  beforeEach: () => {
    loadSession()
  },
  play: async ({ canvas }) => {
    const controls = canvas.getByRole('button', { name: 'Shuffle' }).parentElement
    const progress = canvas.getByText(secondTrack.title).parentElement
    const volume = canvas.getByRole('slider', { name: 'Volume' }).parentElement
    if (!controls || !progress || !volume) throw new Error('The player lost one of its parts')
    const controlsBox = controls.getBoundingClientRect()
    const progressBox = progress.getBoundingClientRect()
    const volumeBox = volume.getBoundingClientRect()

    await expect(progressBox.width).toBe(Number.parseFloat(getComputedStyle(progress).maxWidth))
    await expect(progressBox.left - controlsBox.right).toBeCloseTo(
      volumeBox.left - progressBox.right
    )
  }
}

/** Before any song is played, the player isn't there at all. */
export const Hidden: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('region', { name: 'Player' })).not.toBeInTheDocument()
  }
}

/**
 * "Next song" and "Previous song" move through the queue, and the title follows. With repeat off,
 * the last song has no next one.
 */
export const SkipsSongs: Story = {
  beforeEach: () => {
    loadSession()
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Next song' }))
    await expect(canvas.getByText(thirdTrack.title)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Next song' })).toBeDisabled()

    await userEvent.click(canvas.getByRole('button', { name: 'Previous song' }))
    await expect(canvas.getByText(secondTrack.title)).toBeVisible()
  }
}

/** Stop slides the player away, back to the hidden state it had before any song played. */
export const StopHidesThePlayer: Story = {
  beforeEach: () => {
    loadSession()
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Stop' }))

    await waitFor(() =>
      expect(canvas.queryByRole('region', { name: 'Player' })).not.toBeInTheDocument()
    )
  }
}
