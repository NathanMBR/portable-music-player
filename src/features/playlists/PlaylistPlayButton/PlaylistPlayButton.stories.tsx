import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
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

/** The Other Side was gone from the Songs folder at the last scan, and the playlist's file says so. */
const theOtherSideMissing = () => {
  useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: [bornToBe] } })
  usePlaylistsStore.setState({ playlists: [{ ...sundayMorning, allSongsFound: false }] })
}

const meta = {
  component: PlaylistPlayButton,
  args: { playlist: sundayMorning },
  parameters: renderInOwnFrame(80),
  beforeEach: () => {
    usePlaylistsStore.setState({ playlists: [sundayMorning], loadStatus: 'loaded' })
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: [theOtherSide, bornToBe] } })
    mockCommands({ check_playlist: () => ({ playlist: sundayMorning, missingSongs: [] }) })
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

/**
 * While the song list lacks one of the playlist's songs, a red alert takes the button's place, in a
 * box of the button's size, until a recheck finds them; the mouse resting on it says why.
 */
export const SongsMissing: Story = {
  args: { playlist: { ...sundayMorning, allSongsFound: false } },
  beforeEach: theOtherSideMissing,
  play: async ({ canvas }) => {
    const alert = canvas.getByRole('img', { name: 'Some songs are missing' })

    await expect(canvas.queryByRole('button')).toBeNull()
    await expect(alert).toHaveAttribute('title', 'Some songs are missing')
    await expect(alert.parentElement?.getBoundingClientRect().width).toBe(36)
  }
}

/** The large alert taking the place of the page's large play button, the same size. */
export const LargeSongsMissing: Story = {
  args: { playlist: { ...sundayMorning, allSongsFound: false }, isLarge: true },
  beforeEach: theOtherSideMissing,
  play: async ({ canvas }) => {
    const alert = canvas.getByRole('img', { name: 'Some songs are missing' })

    await expect(canvas.queryByRole('button')).toBeNull()
    await expect(alert.parentElement?.getBoundingClientRect().width).toBe(40)
  }
}

/**
 * When Rust finds a song gone since the last scan, nothing plays, and the song list is scanned
 * again at once, so the alert takes the button's place, as everywhere the song shows.
 */
export const FindingASongGone: Story = {
  beforeEach: () => {
    mockCommands({
      check_playlist: () => ({
        playlist: { ...sundayMorning, allSongsFound: false },
        missingSongs: ['The Other Side.mp3']
      }),
      load_music_library: () => [bornToBe]
    })
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Play Sunday morning' }))

    await expect(await canvas.findByRole('img', { name: 'Some songs are missing' })).toBeVisible()
    await waitFor(() =>
      expect(useLibraryStore.getState().lastScan).toEqual({ kind: 'loaded', tracks: [bornToBe] })
    )
    await expect(usePlaybackStore.getState().session).toBeNull()
  }
}

/** A playlist without songs has nothing to play. */
export const WithoutSongs: Story = {
  args: { playlist: { ...sundayMorning, songs: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Play Sunday morning' })).toBeDisabled()
  }
}
