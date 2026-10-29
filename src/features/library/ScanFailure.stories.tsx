import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, waitFor } from 'storybook/test'
import { mockCommands } from '../../testing/mockCommands'
import { ScanFailure } from './ScanFailure'
import { SAMPLE_TRACKS } from './sampleTracks'

const loadMusicLibrary = fn(() => SAMPLE_TRACKS)

const meta = {
  component: ScanFailure,
  args: {
    message: "Couldn't read the Songs folder at /media/usb/Songs: Permission denied (os error 13)"
  },
  beforeEach: () => {
    mockCommands({ load_music_library: loadMusicLibrary })
  }
} satisfies Meta<typeof ScanFailure>

export default meta
type Story = StoryObj<typeof meta>

/** Rust's error message as it is, and a button that scans the library again. */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(loadMusicLibrary).toHaveBeenCalledOnce())
  }
}
