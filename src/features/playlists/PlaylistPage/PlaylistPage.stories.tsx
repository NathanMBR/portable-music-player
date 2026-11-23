import type { Meta, StoryObj } from '@storybook/react-vite'
import type { InvokeArgs } from '@tauri-apps/api/core'
import { expect, waitFor, within } from 'storybook/test'
import { noCover } from '../../../testing/covers'
import { loggedMessages } from '../../../testing/logs'
import { mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { withNotificationArea } from '../../../testing/withNotificationArea'
import { useLibraryStore } from '../../library/libraryStore'
import type { Track } from '../../library/types'
import { usePlaybackStore } from '../../playback/playbackStore'
import { selectShownPlaylist, usePlaylistsStore } from '../playlistsStore'
import type { PlaylistContents, SavedPlaylist } from '../types'
import { PlaylistPage } from './PlaylistPage'

const whereILive: Track = {
  path: 'Songs/Where I Live.mp3',
  title: 'Where I Live',
  artist: 'Woodkid'
}
const battery: Track = { path: 'Songs/Battery.mp3', title: 'Battery', artist: 'Metallica' }
const falling: Track = { path: 'Songs/Falling.mp3', title: 'Falling', artist: 'Woodkid' }
const twoXFour: Track = { path: 'Songs/2 X 4.mp3', title: '2 X 4', artist: 'Metallica' }

const workout: SavedPlaylist = {
  fileName: '1763590000000-Workout.json',
  title: 'Workout',
  description: 'Fast songs only',
  allSongsFound: true,
  songs: ['Battery.mp3', 'Where I Live.mp3', '2 X 4.mp3']
}

// A song the Songs folder doesn't hold anymore.
const workoutMissingASong: SavedPlaylist = {
  ...workout,
  allSongsFound: false,
  songs: ['Battery.mp3', 'Arising Thunder.mp3', 'Where I Live.mp3']
}

// Rust saves what it's given, every song found.
const savePlaylist = (args?: InvokeArgs) => {
  const { fileName, playlist } = args as { fileName: string; playlist: PlaylistContents }
  return { fileName, ...playlist, allSongsFound: true }
}

/** The page as the Playlists view shows it: of the playlist the store holds, so an edit shows. */
const OfTheShownPlaylist = () => {
  const playlist = usePlaylistsStore(selectShownPlaylist)
  return playlist ? <PlaylistPage playlist={playlist} /> : null
}

/** The names of the header's buttons, in their order. */
const headerButtonNames = (canvasElement: HTMLElement) => {
  const header = canvasElement.querySelector('header')
  if (!header) {
    throw new Error('The page has no header')
  }
  return within(header)
    .getAllByRole('button')
    .map(button => button.getAttribute('aria-label'))
}

/** The playlist on screen, as the store holds it. */
const showing = (playlist: SavedPlaylist) => {
  usePlaylistsStore.setState({
    playlists: [playlist],
    loadStatus: 'loaded',
    shownPlaylist: playlist.fileName
  })
}

const meta = {
  component: PlaylistPage,
  args: { playlist: workout },
  decorators: [withNotificationArea],
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(360) },
  beforeEach: () => {
    showing(workout)
    useLibraryStore.setState({
      lastScan: { kind: 'loaded', tracks: [whereILive, battery, falling, twoXFour] }
    })
    mockCommands({
      read_cover: noCover,
      check_playlist: () => ({ playlist: workout, missingCount: 0 })
    })
  }
} satisfies Meta<typeof PlaylistPage>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The playlist's title in the header, with a back button before it and the large play button at
 * the end. Below the rule, its song count and description, then its songs in the playlist's
 * order.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible()
    // The list of songs has a live region of its own, for screen readers to hear songs move.
    await expect(canvas.getByText('3 songs · Fast songs only')).toBeVisible()
    const songs = within(canvas.getByRole('list', { name: 'Songs of Workout' }))
    const plays = songs.getAllByRole('button', { name: /^Play / })
    await expect(plays.map(button => button.getAttribute('aria-label'))).toEqual([
      'Play Battery',
      'Play Where I Live',
      'Play 2 X 4'
    ])
  }
}

/** A playlist without a description has only its song count on the status line. */
export const WithoutDescription: Story = {
  args: { playlist: { ...workout, description: '' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('3 songs')).toBeVisible()
  }
}

/** The back button goes back to the list of playlists. */
export const GoingBack: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Back to playlists' }))

    await expect(usePlaylistsStore.getState().shownPlaylist).toBeNull()
  }
}

/** The large play button always plays the playlist from its first song. */
export const PlayingFromTheStart: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Play Workout' }))

    await waitFor(() =>
      expect(usePlaybackStore.getState().session).toMatchObject({
        track: battery,
        queue: [battery, whereILive, twoXFour]
      })
    )
  }
}

/** A song's play button plays the playlist from that song, with the playlist as the queue. */
export const PlayingASong: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Play Where I Live' }))

    await waitFor(() =>
      expect(usePlaybackStore.getState().session).toMatchObject({
        track: whereILive,
        queue: [battery, whereILive, twoXFour]
      })
    )
  }
}

/**
 * While the playlist's file says songs are missing: a red alert follows the title, a Recheck
 * button comes before the play button, and every play button is disabled. A song the Songs folder
 * lacks is still listed, under its file name in a lighter ink, with an alert where its play button
 * would be.
 */
export const SongsMissing: Story = {
  args: { playlist: workoutMissingASong },
  beforeEach: () => {
    showing(workoutMissingASong)
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: 'Some songs are missing' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Recheck Workout' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Play Workout' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Play Battery' })).toBeDisabled()
    await expect(canvas.getByRole('img', { name: 'Not in the Songs folder' })).toBeVisible()
    await expect(canvas.getByTitle('Arising Thunder')).toBeVisible()
  }
}

/** A playlist without songs says so in the middle of the view, and has nothing to play. */
export const WithoutSongs: Story = {
  args: { playlist: { ...workout, songs: [] } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'No songs in this playlist' })
    ).toBeVisible()
    await expect(canvas.getByRole('status')).toHaveTextContent('0 songs · Fast songs only')
    await expect(canvas.getByRole('button', { name: 'Play Workout' })).toBeDisabled()
  }
}

/**
 * The Edit button sits right before the large play button, smaller than it, after Recheck when
 * songs are missing.
 */
export const EditButton: Story = {
  args: { playlist: workoutMissingASong },
  beforeEach: () => {
    showing(workoutMissingASong)
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(headerButtonNames(canvasElement)).toEqual([
      'Back to playlists',
      'Recheck Workout',
      'Edit Workout',
      'Play Workout'
    ])
    const edit = canvas.getByRole('button', { name: 'Edit Workout' }).getBoundingClientRect()
    const play = canvas.getByRole('button', { name: 'Play Workout' }).getBoundingClientRect()
    await expect(edit.width).toBeLessThan(play.width)
  }
}

/**
 * Edit opens the playlist's dialog, filled with its values. Once saved, the page shows the new
 * title, description and songs.
 */
export const Editing: Story = {
  parameters: renderInOwnFrame(640),
  render: () => <OfTheShownPlaylist />,
  beforeEach: () => {
    mockCommands({ read_cover: noCover, save_playlist: savePlaylist })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Edit Workout' }))
    const dialog = await page.findByRole('dialog', { name: 'Edit playlist' })
    const title = within(dialog).getByRole('textbox', { name: 'Title' })
    await expect(title).toHaveValue('Workout')
    await userEvent.clear(title)
    await userEvent.type(title, 'Morning workout')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^Falling/ }))

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await expect(
      await canvas.findByRole('heading', { level: 1, name: 'Morning workout' })
    ).toBeVisible()
    await expect(canvas.getByText('4 songs · Fast songs only')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Play Falling' })).toBeVisible()
    await expect(loggedMessages()).toContain('Edited playlist "Morning workout"')
  }
}

/** Each opening starts from the playlist's values: what a cancelled edit typed is gone. */
export const EditingStartsOver: Story = {
  parameters: renderInOwnFrame(640),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Edit Workout' }))
    const dialog = await page.findByRole('dialog', { name: 'Edit playlist' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Title' }), ' at night')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull())

    await userEvent.click(canvas.getByRole('button', { name: 'Edit Workout' }))

    const reopened = await page.findByRole('dialog', { name: 'Edit playlist' })
    await expect(within(reopened).getByRole('textbox', { name: 'Title' })).toHaveValue('Workout')
  }
}
