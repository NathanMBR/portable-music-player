import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { failingCommand, mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { withNotificationArea } from '../../../testing/withNotificationArea'
import { useLibraryStore } from '../../library/libraryStore'
import type { Track } from '../../library/types'
import { selectShownPlaylist, usePlaylistsStore } from '../playlistsStore'
import type { SavedPlaylist } from '../types'
import { RecheckButton } from './RecheckButton'

const innervision: Track = {
  path: 'Songs/Innervision.mp3',
  title: 'Innervision',
  artist: 'System of a Down'
}
const uFig: Track = { path: 'Songs/U-Fig.mp3', title: 'U-Fig', artist: 'System of a Down' }
const hypnotize: Track = {
  path: 'Songs/Hypnotize.mp3',
  title: 'Hypnotize',
  artist: 'System of a Down'
}

const rainyDays: SavedPlaylist = {
  fileName: '1763600011111-Rainy_days.json',
  title: 'Rainy days',
  description: '',
  allSongsFound: false,
  songs: ['Innervision.mp3', 'U-Fig.mp3', 'Hypnotize.mp3']
}

/** The button of the playlist the store holds, as the playlist's page shows it. */
const OfTheShownPlaylist = () => {
  const playlist = usePlaylistsStore(selectShownPlaylist)
  return playlist ? <RecheckButton playlist={playlist} /> : null
}

const meta = {
  component: RecheckButton,
  args: { playlist: rainyDays },
  decorators: [withNotificationArea],
  parameters: renderInOwnFrame(200),
  beforeEach: () => {
    usePlaylistsStore.setState({
      playlists: [rainyDays],
      loadStatus: 'loaded',
      shownPlaylist: rainyDays.fileName
    })
    // Two of its songs were gone at the last scan.
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: [innervision] } })
  }
} satisfies Meta<typeof RecheckButton>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Once every song is back in the Songs folder, a notification says so, and the song list is
 * scanned again, so the songs show everywhere, and the button goes.
 */
export const FindingEverySong: Story = {
  render: () => <OfTheShownPlaylist />,
  beforeEach: () => {
    mockCommands({
      check_playlist: () => ({ playlist: { ...rainyDays, allSongsFound: true }, missingSongs: [] }),
      load_music_library: () => [innervision, uFig, hypnotize]
    })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Recheck Rainy days' }))

    const page = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(page.getByText('Found every song of "Rainy days"')).toBeVisible())
    await expect(usePlaylistsStore.getState().playlists[0]?.allSongsFound).toBe(true)
    await expect(useLibraryStore.getState().lastScan).toEqual({
      kind: 'loaded',
      tracks: [innervision, uFig, hypnotize]
    })
    await expect(canvas.queryByRole('button')).toBeNull()
  }
}

/** While songs are still missing, a notification says how many. */
export const SongsStillMissing: Story = {
  beforeEach: () => {
    mockCommands({
      check_playlist: () => ({ playlist: rainyDays, missingSongs: ['U-Fig.mp3', 'Hypnotize.mp3'] })
    })
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

/**
 * A playlist whose songs are all on the song list needs no recheck: the button isn't there, even
 * when its file says otherwise.
 */
export const AllSongsFound: Story = {
  beforeEach: () => {
    useLibraryStore.setState({
      lastScan: { kind: 'loaded', tracks: [innervision, uFig, hypnotize] }
    })
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button')).toBeNull()
  }
}
