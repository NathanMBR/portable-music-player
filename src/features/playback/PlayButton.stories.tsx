import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { renderInOwnFrame } from '../../testing/storyParameters'
import type { Track } from '../library/types'
import { PlayButton } from './PlayButton'
import { usePlaybackStore } from './playbackStore'

const track: Track = { path: 'Songs/Vida Seca.mp3', title: 'Vida Seca' }

const meta = {
  component: PlayButton,
  args: { track }
} satisfies Meta<typeof PlayButton>

export default meta
type Story = StoryObj<typeof meta>

/** The song isn't playing: the button offers to play it. */
export const Idle: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: `Play ${track.title}` })).toBeVisible()
  }
}

/** The song is playing: the button shows a pause icon and offers to pause it. */
export const Playing: Story = {
  parameters: renderInOwnFrame(80),
  beforeEach: () => {
    usePlaybackStore.setState({ playingTrackPath: track.path })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: `Pause ${track.title}` })).toBeVisible()
  }
}

/** Clicking the button plays the song, and clicking it again stops it. */
export const Toggling: Story = {
  parameters: renderInOwnFrame(80),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: `Play ${track.title}` }))
    await userEvent.click(canvas.getByRole('button', { name: `Pause ${track.title}` }))
    await expect(canvas.getByRole('button', { name: `Play ${track.title}` })).toBeVisible()
  }
}
