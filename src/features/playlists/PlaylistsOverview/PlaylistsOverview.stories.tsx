import type { Meta, StoryObj } from '@storybook/react-vite'
import type { InvokeArgs } from '@tauri-apps/api/core'
import { expect, fn, waitFor, within } from 'storybook/test'
import { failingCommand, mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { withNotificationArea } from '../../../testing/withNotificationArea'
import { useLibraryStore } from '../../library/libraryStore'
import type { Track } from '../../library/types'
import { usePlaybackStore } from '../../playback/playbackStore'
import { usePlaylistsStore } from '../playlistsStore'
import type { SavedPlaylist } from '../types'
import { PlaylistsOverview } from './PlaylistsOverview'

const suggestions: Track = {
  path: 'Songs/Suggestions.mp3',
  title: 'Suggestions',
  artist: 'System of a Down'
}
const silenceAndDistance: Track = {
  path: 'Songs/Silence and Distance.mp3',
  title: 'Silence and Distance',
  artist: 'Angra'
}
const outOfExile: Track = {
  path: 'Songs/Out of Exile.mp3',
  title: 'Out of Exile',
  artist: 'Audioslave'
}

const roadTrip: SavedPlaylist = {
  fileName: '1763581234567-Road_trip.json',
  title: 'Road trip',
  description: 'For the long drive',
  allSongsFound: true,
  songs: ['Silence and Distance.mp3', 'Suggestions.mp3']
}
const lateNight: SavedPlaylist = {
  fileName: '1763581299999-Late_night.json',
  title: 'Late night',
  description: '',
  allSongsFound: false,
  songs: ['Nothing To Say.mp3', 'Lease of Life.mp3', 'Out of Exile.mp3']
}

const DELETE_ERROR =
  "Couldn't delete the playlist 1763581234567-Road_trip.json: Read-only file system (os error 30)"

const listed = (...playlists: SavedPlaylist[]) =>
  usePlaylistsStore.setState({ playlists, loadStatus: 'loaded' })

const deletePlaylist = fn((_args?: InvokeArgs) => undefined)
const createPlaylist = fn((_args?: InvokeArgs) => roadTrip)

const meta = {
  component: PlaylistsOverview,
  decorators: [withNotificationArea],
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(360) },
  beforeEach: () => {
    listed(lateNight, roadTrip)
    useLibraryStore.setState({
      lastScan: { kind: 'loaded', tracks: [suggestions, silenceAndDistance, outOfExile] }
    })
    mockCommands({
      check_playlist: () => ({ playlist: roadTrip, missingCount: 0 }),
      delete_playlist: deletePlaylist,
      create_playlist: createPlaylist
    })
  }
} satisfies Meta<typeof PlaylistsOverview>

export default meta
type Story = StoryObj<typeof meta>

/** Every playlist, sorted by title, one row each, below a status line counting them. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Playlists' })).toBeVisible()
    await expect(canvas.getByRole('status')).toHaveTextContent('2 playlists')
    await expect(canvas.getByRole('list', { name: 'Playlists' }).children).toHaveLength(2)
  }
}

/** Until the Playlists folder is read, the view shows nothing below its header. */
export const Loading: Story = {
  beforeEach: () => {
    usePlaylistsStore.setState({ playlists: [], loadStatus: 'loading' })
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('list')).toBeNull()
    await expect(canvas.getByRole('status')).toBeEmptyDOMElement()
  }
}

/** Without playlists, a message in the middle of the view says how to create one. */
export const Empty: Story = {
  beforeEach: () => {
    listed()
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'No playlists yet' })).toBeVisible()
    await expect(canvas.getByText('Create one with the + button.')).toBeVisible()
  }
}

/**
 * When the Playlists folder couldn't be read, as when the drive was pulled, a notice says what to
 * do, and "Try again" reads it again.
 */
export const LoadFailure: Story = {
  beforeEach: () => {
    usePlaylistsStore.setState({ playlists: [], loadStatus: 'failed' })
    mockCommands({ list_playlists: () => [roadTrip] })
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }))

    await expect(await canvas.findByRole('button', { name: 'Play Road trip' })).toBeVisible()
  }
}

/** A playlist's play button plays it from its first song, once Rust finds them all. */
export const PlayingAPlaylist: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Play Road trip' }))

    await waitFor(() =>
      expect(usePlaybackStore.getState().session).toMatchObject({
        track: silenceAndDistance,
        queue: [silenceAndDistance, suggestions]
      })
    )
  }
}

/**
 * A playlist whose file says songs are missing has an alert after its title, its play button
 * disabled, and a Recheck button. The others play as usual.
 */
export const SongsMissing: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('img', { name: 'Some songs are missing' })).toHaveLength(1)
    await expect(canvas.getByRole('button', { name: 'Play Late night' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Recheck Late night' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Play Road trip' })).toBeEnabled()
    await expect(canvas.queryByRole('button', { name: 'Recheck Road trip' })).toBeNull()
  }
}

/**
 * Delete asks first. Once the playlist is deleted, its row goes, and a notification says so, with
 * an Undo button that writes its file again.
 */
export const DeletingAndUndoing: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Delete Road trip' }))
    const dialog = await page.findByRole('dialog', { name: 'Delete "Road trip"?' })
    await expect(within(dialog).getByText('Its songs stay in the Songs folder.')).toBeVisible()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull())
    await expect(deletePlaylist).toHaveBeenCalledWith({ fileName: roadTrip.fileName })
    await expect(canvas.queryByRole('button', { name: 'Play Road trip' })).toBeNull()
    await waitFor(() => expect(page.getByText('"Road trip" deleted')).toBeVisible())

    await userEvent.click(page.getByRole('button', { name: 'Undo' }))

    await expect(await canvas.findByRole('button', { name: 'Play Road trip' })).toBeVisible()
    await expect(createPlaylist).toHaveBeenCalledOnce()
  }
}

/** Cancel keeps the playlist: nothing is deleted. */
export const CancellingTheDelete: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Delete Road trip' }))

    await userEvent.click(await page.findByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull())
    await expect(deletePlaylist).not.toHaveBeenCalled()
    await expect(canvas.getByRole('button', { name: 'Play Road trip' })).toBeVisible()
  }
}

/** When the file can't be deleted, as on a write-protected drive, the playlist stays and a notification says why. */
export const DeleteFailing: Story = {
  beforeEach: () => {
    mockCommands({ delete_playlist: failingCommand(DELETE_ERROR) })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Delete Road trip' }))

    await userEvent.click(await page.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(page.getByText(DELETE_ERROR)).toBeVisible())
    await expect(canvas.getByRole('button', { name: 'Play Road trip' })).toBeVisible()
  }
}
