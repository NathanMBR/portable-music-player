import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { useLibraryStore } from '../../library/libraryStore'
import type { Track } from '../../library/types'
import { usePlaybackStore } from '../../playback/playbackStore'
import { usePlaylistsStore } from '../playlistsStore'
import type { SavedPlaylist } from '../types'
import { PlaylistPlayButton } from './PlaylistPlayButton'

const theOtherSide: Track = {
  path: 'Songs/The Other Side.mp3',
  title: 'The Other Side',
  artist: 'Woodkid'
}
const bornToBe: Track = { path: 'Songs/Born to Be.mp3', title: 'Born to Be', artist: 'Shaman' }

const sundayMorning: SavedPlaylist = {
  fileName: '1763600000000-Sunday_morning.json',
  title: 'Sunday morning',
  description: '',
  allSongsFound: true,
  songs: ['Born to Be.mp3', 'The Other Side.mp3']
}

const meta = {
  component: PlaylistPlayButton,
  args: { playlist: sundayMorning },
  parameters: renderInOwnFrame(80),
  beforeEach: () => {
    usePlaylistsStore.setState({ playlists: [sundayMorning], loadStatus: 'loaded' })
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: [theOtherSide, bornToBe] } })
    mockCommands({ check_playlist: () => ({ playlist: sundayMorning, missingCount: 0 }) })
  }
} satisfies Meta<typeof PlaylistPlayButton>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The round button of a playlist's row. Once Rust finds every song, it plays the playlist from its
 * first song, with its songs as the queue.
 */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Play Sunday morning' }))

    await expect(usePlaybackStore.getState().session).toMatchObject({
      track: bornToBe,
      queue: [bornToBe, theOtherSide]
    })
  }
}

/** The large filled disc in the header of the playlist's page. */
export const Large: Story = {
  args: { isLarge: true }
}

/** While the playlist's file says songs are missing, it's disabled until a recheck finds them. */
export const SongsMissing: Story = {
  args: { playlist: { ...sundayMorning, allSongsFound: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Play Sunday morning' })).toBeDisabled()
  }
}

/** A playlist without songs has nothing to play. */
export const WithoutSongs: Story = {
  args: { playlist: { ...sundayMorning, songs: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Play Sunday morning' })).toBeDisabled()
  }
}
