import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { failingCommand, mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { withNotificationArea } from '../../../testing/withNotificationArea'
import { usePlaylistsStore } from '../playlistsStore'
import type { SavedPlaylist } from '../types'
import { RecheckButton } from './RecheckButton'

const rainyDays: SavedPlaylist = {
  fileName: '1763600011111-Rainy_days.json',
  title: 'Rainy days',
  description: '',
  allSongsFound: false,
  songs: ['Innervision.mp3', 'U-Fig.mp3', 'Hypnotize.mp3']
}

const meta = {
  component: RecheckButton,
  args: { playlist: rainyDays },
  decorators: [withNotificationArea],
  parameters: renderInOwnFrame(200),
  beforeEach: () => {
    usePlaylistsStore.setState({ playlists: [rainyDays], loadStatus: 'loaded' })
  }
} satisfies Meta<typeof RecheckButton>

export default meta
type Story = StoryObj<typeof meta>

/** Once every song is back in the Songs folder, a notification says so. */
export const FindingEverySong: Story = {
  beforeEach: () => {
    mockCommands({
      check_playlist: () => ({ playlist: { ...rainyDays, allSongsFound: true }, missingCount: 0 })
    })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Recheck Rainy days' }))

    const page = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(page.getByText('Found every song of "Rainy days"')).toBeVisible())
    await expect(usePlaylistsStore.getState().playlists[0]?.allSongsFound).toBe(true)
  }
}

/** While songs are still missing, a notification says how many. */
export const SongsStillMissing: Story = {
  beforeEach: () => {
    mockCommands({ check_playlist: () => ({ playlist: rainyDays, missingCount: 2 }) })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Recheck Rainy days' }))

    const page = within(canvasElement.ownerDocument.body)
    await waitFor(() =>
      expect(page.getByText('2 songs are missing from the Songs folder.')).toBeVisible()
    )
  }
}

/** When Rust can't look, as when the playlist's file is gone, a notification says why. */
export const CheckFailing: Story = {
  beforeEach: () => {
    mockCommands({
      check_playlist: failingCommand(
        "Couldn't find the playlist 1763600011111-Rainy_days.json: it may have been moved, renamed or deleted"
      )
    })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Recheck Rainy days' }))

    const page = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(page.getByText(`Couldn't check "Rainy days"`)).toBeVisible())
  }
}

/** A playlist whose songs were all found needs no recheck: the button isn't there. */
export const AllSongsFound: Story = {
  args: { playlist: { ...rainyDays, allSongsFound: true } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button')).toBeNull()
  }
}
