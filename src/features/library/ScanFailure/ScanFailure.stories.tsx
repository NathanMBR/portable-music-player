import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, waitFor } from 'storybook/test'
import { mockCommands } from '../../../testing/mockCommands'
import type { Track } from '../types'
import { ScanFailure } from './ScanFailure'

const TRACKS: Track[] = [
  { path: 'Songs/Unfinished Allegro.mp3', title: 'Unfinished Allegro', artist: 'Angra' },
  { path: 'Songs/Extreme Dream.mp3', title: 'Extreme Dream', artist: 'Angra' },
  { path: 'Songs/Dead Man On Display.mp3', title: 'Dead Man On Display', artist: 'Angra' }
]

const loadMusicLibrary = fn(() => TRACKS)

const meta = {
  component: ScanFailure,
  beforeEach: () => {
    mockCommands({ load_music_library: loadMusicLibrary })
  }
} satisfies Meta<typeof ScanFailure>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A calm notice in place of the song list, and a button that scans the library again. Rust's reason
 * is in the notification the failed scan raised.
 */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(loadMusicLibrary).toHaveBeenCalledOnce())
  }
}
