import type { Meta, StoryObj } from '@storybook/react-vite'
import type { InvokeArgs } from '@tauri-apps/api/core'
import { expect, fn, waitFor, within } from 'storybook/test'
import { noCover } from '../../../testing/covers'
import { loggedMessages } from '../../../testing/logs'
import { mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { withNotificationArea } from '../../../testing/withNotificationArea'
import { useLibraryStore } from '../../library/libraryStore'
import type { Track } from '../../library/types'
import { selectShownPlaylist, usePlaylistsStore } from '../playlistsStore'
import type { PlaylistContents, SavedPlaylist } from '../types'
import { PlaylistSongList } from './PlaylistSongList'

const darts: Track = { path: 'Songs/Darts.mp3', title: 'Darts', artist: 'System of a Down' }
const cigaro: Track = { path: 'Songs/Cigaro.mp3', title: 'Cigaro', artist: 'System of a Down' }
const aMonsterInHerEyes: Track = {
  path: 'Songs/A Monster in Her Eyes.mp3',
  title: 'A Monster in Her Eyes',
  artist: 'Angra'
}

// A song the Songs folder doesn't hold anymore.
const MISSING_SONG = "Don't Tread on Me.mp3"

const lateDrive: SavedPlaylist = {
  fileName: '1763600077777-Late_drive.json',
  title: 'Late drive',
  description: '',
  allSongsFound: true,
  songs: ['Darts.mp3', 'Cigaro.mp3', 'A Monster in Her Eyes.mp3']
}

const lateDriveMissingASong: SavedPlaylist = {
  ...lateDrive,
  allSongsFound: false,
  songs: ['Darts.mp3', MISSING_SONG, 'Cigaro.mp3']
}

// Rust saves what it's given, and finds every song but the missing one.
const savePlaylist = fn((args?: InvokeArgs) => {
  const { fileName, playlist } = args as { fileName: string; playlist: PlaylistContents }
  return { fileName, ...playlist, allSongsFound: !playlist.songs.includes(MISSING_SONG) }
})

/** The playlist on screen, as the store holds it. */
const showing = (playlist: SavedPlaylist) => {
  usePlaylistsStore.setState({
    playlists: [playlist],
    loadStatus: 'loaded',
    shownPlaylist: playlist.fileName
  })
}

/** The list as its page shows it: of the playlist the store holds, so each change shows at once. */
const OfTheShownPlaylist = () => {
  const playlist = usePlaylistsStore(selectShownPlaylist)
  return playlist ? <PlaylistSongList playlist={playlist} /> : null
}

/** Each row as it reads: its position, then its song's name, like "1. Darts · System of a Down". */
const rowsIn = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map(row => {
      const position = within(row).getByText(/^\d+$/).textContent ?? ''
      return `${position}. ${row.textContent?.slice(position.length)}`
    })

type Clicker = { click: (element: Element) => Promise<void> }

/** Chooses an action from a song's menu, as the user does: opens it, then clicks the item. */
const chooseFromMenu = async (
  page: ReturnType<typeof within>,
  user: Clicker,
  { menu, item }: { menu: string; item: string }
) => {
  await user.click(page.getByRole('button', { name: menu }))
  await user.click(await page.findByRole('menuitem', { name: item }))
}

const meta = {
  component: PlaylistSongList,
  args: { playlist: lateDrive },
  render: () => <OfTheShownPlaylist />,
  decorators: [withNotificationArea],
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(400) },
  beforeEach: () => {
    showing(lateDrive)
    useLibraryStore.setState({
      lastScan: { kind: 'loaded', tracks: [darts, cigaro, aMonsterInHerEyes] }
    })
    mockCommands({ read_cover: noCover, save_playlist: savePlaylist })
  }
} satisfies Meta<typeof PlaylistSongList>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The songs in the playlist's order. Each row starts with its Move handle and ends with its menu.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    const row = within(canvas.getAllByRole('listitem')[0] ?? canvas.getByRole('list'))

    await expect(
      row.getAllByRole('button').map(button => button.getAttribute('aria-label'))
    ).toEqual(['Move Darts', 'Play Darts', 'More for Darts'])
  }
}

/** A song's menu offers to change its position or to remove it from the playlist. */
export const SongMenu: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'More for Cigaro' }))

    const menu = await within(canvasElement.ownerDocument.body).findByRole('menu')
    await expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent)
    ).toEqual(['Change position', 'Remove from playlist'])
  }
}

/**
 * Change position opens a dialog that places the song before or after another. Once it's
 * confirmed, the song moves there, the positions follow, and the playlist is saved in that order.
 */
export const ChangingAPosition: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await chooseFromMenu(page, userEvent, { menu: 'More for Darts', item: 'Change position' })
    const dialog = within(
      await page.findByRole('dialog', { name: 'Change the position of "Darts"' })
    )

    await userEvent.click(dialog.getByRole('radio', { name: 'After' }))
    await userEvent.click(dialog.getByRole('radio', { name: '3. A Monster in Her Eyes · Angra' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(rowsIn(canvas.getByRole('list', { name: 'Songs of Late drive' }))).toEqual([
        '1. Cigaro · System of a Down',
        '2. A Monster in Her Eyes · Angra',
        '3. Darts · System of a Down'
      ])
    )
    await expect(savePlaylist).toHaveBeenCalledWith(
      expect.objectContaining({
        playlist: expect.objectContaining({
          songs: ['Cigaro.mp3', 'A Monster in Her Eyes.mp3', 'Darts.mp3']
        })
      })
    )
    await expect(loggedMessages()).toContain(
      'Moved song "Darts" to position 3 in playlist "Late drive"'
    )
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull())
  }
}

/** Right after its Move handle, each row shows its song's position in the playlist, from 1. */
export const Positions: Story = {
  play: async ({ canvas }) => {
    await expect(rowsIn(canvas.getByRole('list', { name: 'Songs of Late drive' }))).toEqual([
      '1. Darts · System of a Down',
      '2. Cigaro · System of a Down',
      '3. A Monster in Her Eyes · Angra'
    ])
  }
}

/** A box's left and right edges on screen, from its bounding rectangle. */
const edgesOf = (element: Element | null | undefined) => {
  if (!element) {
    throw new Error('Nothing to measure')
  }
  const { left, right } = element.getBoundingClientRect()
  return { left, right }
}

/**
 * The play button sits as far from the drag area, the Move handle and the position after it, as
 * from the cover: from what the eye sees, the position's digits and the play button's icon, since
 * the quiet button shows no box of its own until hovered.
 */
export const PlaySpacedEvenly: Story = {
  play: async ({ canvas }) => {
    const play = canvas.getByRole('button', { name: 'Play Darts' })
    const playIcon = edgesOf(play.querySelector('svg'))
    const position = edgesOf(play.previousElementSibling)
    const cover = edgesOf(play.nextElementSibling)

    await expect(playIcon.left - position.right).toBeCloseTo(cover.left - playIcon.right, 0)
  }
}

/**
 * A song moved from the keyboard takes its new place, the positions follow, and the playlist is
 * saved in that order.
 */
export const MovingASong: Story = {
  play: async ({ canvas, userEvent }) => {
    canvas.getByRole('button', { name: 'Move Darts' }).focus()

    await userEvent.keyboard(' ')
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard(' ')

    await waitFor(() =>
      expect(savePlaylist).toHaveBeenCalledWith({
        fileName: lateDrive.fileName,
        playlist: {
          title: 'Late drive',
          description: '',
          songs: ['Cigaro.mp3', 'Darts.mp3', 'A Monster in Her Eyes.mp3']
        }
      })
    )
    await expect(rowsIn(canvas.getByRole('list', { name: 'Songs of Late drive' }))).toEqual([
      '1. Cigaro · System of a Down',
      '2. Darts · System of a Down',
      '3. A Monster in Her Eyes · Angra'
    ])
    await expect(loggedMessages()).toContain(
      'Moved song "Darts" to position 2 in playlist "Late drive"'
    )
  }
}

/**
 * Remove from playlist asks first. Once it's confirmed, the song leaves the playlist, though not the Songs
 * folder, the songs after it move up a position, and a notification says so, with an Undo button.
 */
export const RemovingASong: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await chooseFromMenu(page, userEvent, { menu: 'More for Cigaro', item: 'Remove from playlist' })
    const dialog = await page.findByRole('dialog', { name: 'Remove "Cigaro" from "Late drive"?' })
    await expect(within(dialog).getByText('The song stays in the Songs folder.')).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(page.getByText('"Cigaro" removed from "Late drive"')).toBeVisible())
    await expect(savePlaylist).toHaveBeenCalledWith(
      expect.objectContaining({
        playlist: expect.objectContaining({ songs: ['Darts.mp3', 'A Monster in Her Eyes.mp3'] })
      })
    )
    await expect(rowsIn(canvas.getByRole('list', { name: 'Songs of Late drive' }))).toEqual([
      '1. Darts · System of a Down',
      '2. A Monster in Her Eyes · Angra'
    ])
    await expect(loggedMessages()).toContain('Removed song "Cigaro" from playlist "Late drive"')
  }
}

/** The notification's Undo puts the removed song back where it was, at its old position. */
export const UndoingARemoval: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await chooseFromMenu(page, userEvent, { menu: 'More for Cigaro', item: 'Remove from playlist' })
    await userEvent.click(
      within(await page.findByRole('dialog')).getByRole('button', { name: 'Remove' })
    )

    await userEvent.click(await page.findByRole('button', { name: 'Undo' }))

    await waitFor(() =>
      expect(rowsIn(canvas.getByRole('list', { name: 'Songs of Late drive' }))).toEqual([
        '1. Darts · System of a Down',
        '2. Cigaro · System of a Down',
        '3. A Monster in Her Eyes · Angra'
      ])
    )
  }
}

/** Cancel keeps the song in the playlist. */
export const CancellingARemoval: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await chooseFromMenu(page, userEvent, { menu: 'More for Cigaro', item: 'Remove from playlist' })

    await userEvent.click(
      within(await page.findByRole('dialog')).getByRole('button', { name: 'Cancel' })
    )

    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull())
    await expect(savePlaylist).not.toHaveBeenCalled()
    await expect(canvas.getByRole('button', { name: 'More for Cigaro' })).toBeVisible()
  }
}

/**
 * A song the last scan lacks is listed under its file name, faded, with an alert where its play
 * button would be, and the other play buttons are disabled. It still moves and goes like the
 * others.
 */
export const MissingSong: Story = {
  beforeEach: () => {
    showing(lateDriveMissingASong)
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await expect(canvas.getByRole('img', { name: 'Not in the Songs folder' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Play Darts' })).toBeDisabled()

    await chooseFromMenu(page, userEvent, {
      menu: "More for Don't Tread on Me",
      item: 'Remove from playlist'
    })
    await userEvent.click(
      within(
        await page.findByRole('dialog', { name: `Remove "Don't Tread on Me" from "Late drive"?` })
      ).getByRole('button', { name: 'Remove' })
    )

    await waitFor(() => expect(canvas.getByRole('button', { name: 'Play Darts' })).toBeEnabled())
    await expect(rowsIn(canvas.getByRole('list'))).toEqual([
      '1. Darts · System of a Down',
      '2. Cigaro · System of a Down'
    ])
  }
}

/** A missing song moves like the others: Rust still finds it missing once the playlist is saved. */
export const MovingAMissingSong: Story = {
  beforeEach: () => {
    showing(lateDriveMissingASong)
  },
  play: async ({ canvas, userEvent }) => {
    canvas.getByRole('button', { name: "Move Don't Tread on Me" }).focus()

    await userEvent.keyboard(' ')
    await userEvent.keyboard('{ArrowUp}')
    await userEvent.keyboard(' ')

    await waitFor(() =>
      expect(savePlaylist).toHaveBeenCalledWith(
        expect.objectContaining({
          playlist: expect.objectContaining({
            songs: [MISSING_SONG, 'Darts.mp3', 'Cigaro.mp3']
          })
        })
      )
    )
    await expect(canvas.getByRole('button', { name: 'Play Darts' })).toBeDisabled()
  }
}

/** Once its last song is removed, the playlist says it has none. */
export const RemovingTheLastSong: Story = {
  beforeEach: () => {
    showing({ ...lateDrive, songs: ['Darts.mp3'] })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await chooseFromMenu(page, userEvent, { menu: 'More for Darts', item: 'Remove from playlist' })

    await userEvent.click(
      within(await page.findByRole('dialog')).getByRole('button', { name: 'Remove' })
    )

    await expect(
      await canvas.findByRole('heading', { name: 'No songs in this playlist' })
    ).toBeVisible()
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull())
  }
}
