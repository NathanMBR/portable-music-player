import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { noCover } from '../../../testing/covers'
import { loggedMessages } from '../../../testing/logs'
import { mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { useLibraryStore } from '../../library/libraryStore'
import type { Track } from '../../library/types'
import { usePlaylistsStore } from '../playlistsStore'
import type { SavedPlaylist } from '../types'
import { PlaylistsView } from './PlaylistsView'

const noPainForTheDead: Track = {
  path: 'Songs/No Pain for the Dead.mp3',
  title: 'No Pain for the Dead',
  artist: 'Angra'
}
const getawayCar: Track = {
  path: 'Songs/Getaway Car.mp3',
  title: 'Getaway Car',
  artist: 'Audioslave'
}
const windsOfDestination: Track = {
  path: 'Songs/Winds of Destination.mp3',
  title: 'Winds of Destination',
  artist: 'Angra'
}
const cubert: Track = { path: 'Songs/CUBErt.mp3', title: 'CUBErt', artist: 'System of a Down' }

const longWeekend: SavedPlaylist = {
  fileName: '1763600033333-Long_weekend.json',
  title: 'Long weekend',
  description: '',
  allSongsFound: true,
  songs: ['Getaway Car.mp3', 'Winds of Destination.mp3']
}
const studying: SavedPlaylist = {
  fileName: '1763600044444-Studying.json',
  title: 'Studying',
  description: 'Nothing too loud',
  allSongsFound: true,
  songs: ['No Pain for the Dead.mp3', 'CUBErt.mp3']
}

const meta = {
  component: PlaylistsView,
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(320) },
  beforeEach: () => {
    usePlaylistsStore.setState({ playlists: [longWeekend, studying], loadStatus: 'loaded' })
    useLibraryStore.setState({
      lastScan: {
        kind: 'loaded',
        tracks: [noPainForTheDead, getawayCar, windsOfDestination, cubert]
      }
    })
    mockCommands({ read_cover: noCover })
  }
} satisfies Meta<typeof PlaylistsView>

export default meta
type Story = StoryObj<typeof meta>

/** The list of playlists, as the Playlists category first shows it. */
export const List: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Playlists' })).toBeVisible()
  }
}

/** See opens a playlist in place of the list, and the back button goes back to it. */
export const OpeningAndGoingBack: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'See Studying' }))

    await expect(canvas.getByRole('heading', { level: 1, name: 'Studying' })).toBeVisible()
    await expect(loggedMessages()).toContain('Opened playlist "Studying"')

    await userEvent.click(canvas.getByRole('button', { name: 'Back to playlists' }))

    await expect(canvas.getByRole('heading', { level: 1, name: 'Playlists' })).toBeVisible()
  }
}

/** Coming back from another page shows the playlist that was open. */
export const RemembersTheOpenPlaylist: Story = {
  beforeEach: () => {
    usePlaylistsStore.setState({ shownPlaylist: longWeekend.fileName })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Long weekend' })).toBeVisible()
  }
}
