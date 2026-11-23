import type { Meta, StoryObj } from '@storybook/react-vite'
import type { InvokeArgs } from '@tauri-apps/api/core'
import { expect, fn, waitFor, within } from 'storybook/test'
import { noCover } from '../../../testing/covers'
import { loggedMessages } from '../../../testing/logs'
import { mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import type { Track } from '../../library/types'
import type { PlaylistSong } from '../playlistSongs'
import { usePlaylistsStore } from '../playlistsStore'
import type { PlaylistContents, SavedPlaylist } from '../types'
import { ChangePositionDialog } from './ChangePositionDialog'

const violentPornography: Track = {
  path: 'Songs/Violent Pornography.mp3',
  title: 'Violent Pornography',
  artist: 'System of a Down'
}
const boatSong: Track = { path: 'Songs/Boat Song.mp3', title: 'Boat Song', artist: 'Woodkid' }
const jetPilot: Track = {
  path: 'Songs/Jet Pilot.mp3',
  title: 'Jet Pilot',
  artist: 'System of a Down'
}
const thetawaves: Track = {
  path: 'Songs/Thetawaves.mp3',
  title: 'Thetawaves',
  artist: 'System of a Down'
}

// The last song is gone from the Songs folder, so the scan lacks it.
const songs: PlaylistSong[] = [
  { fileName: 'Violent Pornography.mp3', track: violentPornography },
  { fileName: 'Boat Song.mp3', track: boatSong },
  { fileName: 'Jet Pilot.mp3', track: jetPilot },
  { fileName: 'Thetawaves.mp3', track: thetawaves },
  { fileName: 'Drawn to You.mp3', track: null }
]

const nightShift: SavedPlaylist = {
  fileName: '1763600088888-Night_shift.json',
  title: 'Night shift',
  description: '',
  allSongsFound: false,
  songs: songs.map(song => song.fileName)
}

const savePlaylist = fn((args?: InvokeArgs) => {
  const { fileName, playlist } = args as { fileName: string; playlist: PlaylistContents }
  return { fileName, ...playlist, allSongsFound: false }
})

/** The order of songs the dialog asked Rust to save. */
const savedSongs = () => {
  const [args] = savePlaylist.mock.lastCall ?? []
  return (args as { playlist: PlaylistContents } | undefined)?.playlist.songs
}

const meta = {
  component: ChangePositionDialog,
  args: { isOpen: true, onClose: fn(), playlist: nightShift, songs, song: songs[1] ?? songs[0] },
  parameters: { ...renderInOwnFrame(640) },
  beforeEach: () => {
    usePlaylistsStore.setState({ playlists: [nightShift], loadStatus: 'loaded' })
    mockCommands({ read_cover: noCover, save_playlist: savePlaylist })
  }
} satisfies Meta<typeof ChangePositionDialog>

export default meta
type Story = StoryObj<typeof meta>

/** The radios of a radio group, by their names, as screen readers hear them. */
const radioNamesIn = (group: HTMLElement) =>
  within(group)
    .getAllByRole('radio')
    .map(radio => radio.getAttribute('aria-label'))

/**
 * Opened from a song's menu, the dialog names the song, offers to place it before or after
 * another, Before at first, on one line, and lists the playlist's other songs with their
 * positions, the missing one under its file name. Confirm waits for a song to be picked.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole('dialog', {
        name: 'Change the position of "Boat Song"'
      })
    )
    const before = dialog.getByRole('radio', { name: 'Before' })
    const after = dialog.getByRole('radio', { name: 'After' })

    await expect(before).toBeChecked()
    await expect(before.getBoundingClientRect().top).toBe(after.getBoundingClientRect().top)
    await expect(radioNamesIn(dialog.getByRole('radiogroup', { name: 'Songs' }))).toEqual([
      '1. Violent Pornography · System of a Down',
      '3. Jet Pilot · System of a Down',
      '4. Thetawaves · System of a Down',
      '5. Drawn to You'
    ])
    await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  }
}

/** Typing a position finds the song there, and only it: 4 finds the fourth song. */
export const SearchingByPosition: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'))

    await userEvent.type(dialog.getByRole('searchbox', { name: 'Search songs' }), '4')

    await expect(radioNamesIn(dialog.getByRole('radiogroup', { name: 'Songs' }))).toEqual([
      '4. Thetawaves · System of a Down'
    ])
  }
}

/**
 * The search finds songs by title, artist or file name, like the song picker of the playlist
 * dialog, and finds a missing song by its file name.
 */
export const SearchingByName: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'))
    const search = dialog.getByRole('searchbox', { name: 'Search songs' })

    await userEvent.type(search, 'pilot')
    await expect(radioNamesIn(dialog.getByRole('radiogroup', { name: 'Songs' }))).toEqual([
      '3. Jet Pilot · System of a Down'
    ])

    await userEvent.clear(search)
    await userEvent.type(search, 'drawn')
    await expect(radioNamesIn(dialog.getByRole('radiogroup', { name: 'Songs' }))).toEqual([
      '5. Drawn to You'
    ])
  }
}

/** A search that finds nothing says so, where the songs would be. */
export const NothingFound: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'))

    await userEvent.type(dialog.getByRole('searchbox', { name: 'Search songs' }), 'Angra')

    await expect(dialog.getByText('No songs match "Angra".')).toBeVisible()
    await expect(dialog.queryByRole('radiogroup', { name: 'Songs' })).toBeNull()
  }
}

/**
 * Before, then a song above the moving one: Confirm places it right before that song, saves the
 * playlist in its new order, and closes the dialog.
 */
export const MovingBefore: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'))

    await userEvent.click(
      dialog.getByRole('radio', { name: '1. Violent Pornography · System of a Down' })
    )
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))

    await expect(args.onClose).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(savedSongs()).toEqual([
        'Boat Song.mp3',
        'Violent Pornography.mp3',
        'Jet Pilot.mp3',
        'Thetawaves.mp3',
        'Drawn to You.mp3'
      ])
    )
    await waitFor(() =>
      expect(loggedMessages()).toContain(
        'Moved song "Boat Song" to position 1 in playlist "Night shift"'
      )
    )
  }
}

/** After, then a song below the moving one: Confirm places it right after that song. */
export const MovingAfter: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'))

    await userEvent.click(dialog.getByRole('radio', { name: 'After' }))
    await userEvent.click(dialog.getByRole('radio', { name: '4. Thetawaves · System of a Down' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(savedSongs()).toEqual([
        'Violent Pornography.mp3',
        'Jet Pilot.mp3',
        'Thetawaves.mp3',
        'Boat Song.mp3',
        'Drawn to You.mp3'
      ])
    )
    await waitFor(() =>
      expect(loggedMessages()).toEqual([
        'Radio group "Place it" set value to "After"',
        'Radio group "Songs" set value to "4. Thetawaves · System of a Down"',
        'Moved song "Boat Song" to position 4 in playlist "Night shift"'
      ])
    )
  }
}

/**
 * Placing the song where it already is, like before the song right after it, closes the dialog
 * without saving anything.
 */
export const PickingWhereItIs: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'))

    await userEvent.click(dialog.getByRole('radio', { name: '3. Jet Pilot · System of a Down' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))

    await expect(args.onClose).toHaveBeenCalledOnce()
    await expect(savePlaylist).not.toHaveBeenCalled()
  }
}

/** A song picked stays picked while the search hides it, so Confirm stays on. */
export const PickHiddenBySearch: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'))

    await userEvent.click(dialog.getByRole('radio', { name: '3. Jet Pilot · System of a Down' }))
    await userEvent.type(dialog.getByRole('searchbox', { name: 'Search songs' }), 'thetawaves')

    await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeEnabled()
  }
}

/** Cancel closes the dialog and leaves the playlist as it was. */
export const Cancelling: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'))

    await userEvent.click(dialog.getByRole('radio', { name: '4. Thetawaves · System of a Down' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

    await expect(args.onClose).toHaveBeenCalledOnce()
    await expect(savePlaylist).not.toHaveBeenCalled()
  }
}

/** In a playlist of one song, there's no other song to place it by, and the dialog says so. */
export const OnlySong: Story = {
  args: {
    playlist: { ...nightShift, songs: ['Boat Song.mp3'] },
    songs: [{ fileName: 'Boat Song.mp3', track: boatSong }],
    song: { fileName: 'Boat Song.mp3', track: boatSong }
  },
  play: async ({ canvasElement }) => {
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'))

    await expect(dialog.getByText('No other songs in this playlist.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  }
}
