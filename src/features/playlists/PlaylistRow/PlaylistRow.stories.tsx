import type { Meta, StoryObj } from '@storybook/react-vite'
import type { InvokeArgs } from '@tauri-apps/api/core'
import { expect, fn, waitFor, within } from 'storybook/test'
import { drawCover, noCover, UNTIL_COVER_SHOWS } from '../../../testing/covers'
import { loggedMessages } from '../../../testing/logs'
import { mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { useLibraryStore } from '../../library/libraryStore'
import type { Track } from '../../library/types'
import { connectButtonLog } from '../../logging/buttonLog'
import { usePlaylistsStore } from '../playlistsStore'
import type { SavedPlaylist } from '../types'
import { PlaylistRow } from './PlaylistRow'

const cityLights: SavedPlaylist = {
  fileName: '1763600022222-City_lights.json',
  title: 'City lights',
  description: 'Late trains and empty streets',
  allSongsFound: true,
  songs: ['Know.mp3', 'Stealing Society.mp3', 'Wuthering Heights.mp3', 'Shift.mp3']
}

const know: Track = { path: 'Songs/Know.mp3', title: 'Know', artist: 'System of a Down' }
const stealingSociety: Track = {
  path: 'Songs/Stealing Society.mp3',
  title: 'Stealing Society',
  artist: 'System of a Down'
}
const wutheringHeights: Track = {
  path: 'Songs/Wuthering Heights.mp3',
  title: 'Wuthering Heights',
  artist: 'Angra'
}
const shift: Track = { path: 'Songs/Shift.mp3', title: 'Shift', artist: 'Woodkid' }

const scanned = (tracks: Track[]) =>
  useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks } })

/** Shift was gone from the Songs folder at the last scan, and the playlist's file says so. */
const shiftMissing = () => {
  scanned([know, stealingSociety, wutheringHeights])
  usePlaylistsStore.setState({ playlists: [{ ...cityLights, allSongsFound: false }] })
}

// Rust finds every song again.
const checkPlaylist = fn((_args?: InvokeArgs) => ({ playlist: cityLights, missingSongs: [] }))

const requestedPath = (args?: InvokeArgs) => (args as { path: string }).path

// None of the playlist's songs has a cover.
const readNoCover = fn(noCover)

// Know has no cover, and the songs after it each have one.
const readCoversAfterKnow = fn((args?: InvokeArgs) =>
  requestedPath(args) === know.path ? noCover() : drawCover()
)

/** The square before the playlist's name, where a song's row shows its cover. */
const squareIn = (canvasElement: HTMLElement) =>
  within(canvasElement).getByRole('button', { name: 'See City lights' }).parentElement
    ?.previousElementSibling ?? null

/** Where a real click at the middle of the element lands, whatever covers it. */
const elementAtTheMiddleOf = (element: Element) => {
  const box = element.getBoundingClientRect()
  const landing = element.ownerDocument.elementFromPoint(
    box.left + box.width / 2,
    box.top + box.height / 2
  )
  if (!landing) {
    throw new Error('Nothing is under the middle of the element')
  }
  return landing
}

/** Where a real click on the row's left padding, before its first control, lands. */
const elementAtTheRowStart = (row: Element) => {
  const box = row.getBoundingClientRect()
  const landing = row.ownerDocument.elementFromPoint(box.left + 2, box.top + box.height / 2)
  if (!landing) {
    throw new Error('Nothing is under the start of the row')
  }
  return landing
}

const meta = {
  component: PlaylistRow,
  args: { playlist: cityLights, onEdit: fn(), onDelete: fn() },
  parameters: renderInOwnFrame(240),
  // Rows are list items, so they need a list around them.
  decorators: [
    Story => (
      <ul>
        <Story />
      </ul>
    )
  ],
  beforeEach: () => {
    usePlaylistsStore.setState({ playlists: [cityLights], loadStatus: 'loaded' })
    scanned([know, stealingSociety, wutheringHeights, shift])
    mockCommands({ read_cover: noCover })
  }
} satisfies Meta<typeof PlaylistRow>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Its play button, the square of its cover, the title and description, then the menu of what can be
 * done to it at the right end. The whole row is a button that opens the playlist, and hovering it
 * shows the name whole.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Play City lights' })).toBeEnabled()
    await expect(canvas.getByRole('button', { name: 'See City lights' })).toHaveAttribute(
      'title',
      'City lights · Late trains and empty streets'
    )
    await expect(canvas.getByRole('button', { name: 'More for City lights' })).toBeVisible()
  }
}

/**
 * A playlist has no cover of its own, so its square shows the cover of its first song that has
 * one, in the playlist's order: here Know has none, so the square shows Stealing Society's, and the
 * songs after it are never read.
 */
export const CoverOfItsFirstSongWithOne: Story = {
  beforeEach: () => {
    mockCommands({ read_cover: readCoversAfterKnow })
  },
  play: async ({ canvasElement }) => {
    await waitFor(
      () => expect(squareIn(canvasElement)?.querySelector('img')?.naturalWidth).toBeGreaterThan(0),
      UNTIL_COVER_SHOWS
    )

    await expect(readCoversAfterKnow.mock.calls.map(([args]) => requestedPath(args))).toEqual([
      know.path,
      stealingSociety.path
    ])
  }
}

/** When none of its songs has a cover, the square shows the Playlists icon. */
export const WithoutCovers: Story = {
  beforeEach: () => {
    mockCommands({ read_cover: readNoCover })
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(readNoCover).toHaveBeenCalledTimes(4), UNTIL_COVER_SHOWS)

    await waitFor(() => expect(squareIn(canvasElement)?.querySelector('svg')).not.toBeNull())
    await expect(squareIn(canvasElement)?.querySelector('img')).toBeNull()
  }
}

/** A playlist without a description shows its title alone. */
export const WithoutDescription: Story = {
  args: { playlist: { ...cityLights, description: '' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'See City lights' })).toHaveAttribute(
      'title',
      'City lights'
    )
    await expect(canvas.getByRole('listitem')).toHaveTextContent(/^City lights$/)
  }
}

/**
 * While the song list lacks one of its songs, a red alert takes the play button's place, before
 * the square, and nothing follows the title. The alert sits above the row, so the mouse resting on
 * it says why.
 */
export const SongsMissing: Story = {
  args: { playlist: { ...cityLights, allSongsFound: false } },
  beforeEach: shiftMissing,
  play: async ({ canvas }) => {
    const alert = canvas.getByRole('img', { name: 'Some songs are missing' })
    const title = canvas.getByRole('button', { name: 'See City lights' })

    await expect(canvas.queryByRole('button', { name: 'Play City lights' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: /^Recheck/ })).toBeNull()
    await expect(alert.getBoundingClientRect().right).toBeLessThan(
      title.getBoundingClientRect().left
    )
    await expect(elementAtTheMiddleOf(alert).closest('[role="img"]')).toBe(alert)
  }
}

/** A name too long for the row is cut with an ellipsis, and the buttons keep their place. */
export const LongName: Story = {
  args: {
    playlist: {
      ...cityLights,
      allSongsFound: false,
      description:
        'Late trains and empty streets, the windows of the last bus and the lights of the bridge at three in the morning'
    }
  },
  beforeEach: shiftMissing,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'More for City lights' })).toBeVisible()
  }
}

/** A click anywhere on the row outside its buttons, like on its description, opens the playlist. */
export const OpeningFromTheRow: Story = {
  beforeEach: () => connectButtonLog(),
  play: async ({ canvas, userEvent }) => {
    const landing = elementAtTheMiddleOf(canvas.getByText(/Late trains and empty streets/))
    await expect(landing).toBe(canvas.getByRole('button', { name: 'See City lights' }))

    await userEvent.click(landing)

    await expect(usePlaylistsStore.getState().shownPlaylist).toBe(cityLights.fileName)
    await expect(loggedMessages()).toEqual([
      'Clicked at button "See City lights"',
      'Opened playlist "City lights"'
    ])
  }
}

/**
 * The keyboard reaches the row in its place, after its play button, as its title, with its focus
 * ring around the whole row, and Enter opens the playlist.
 */
export const OpeningFromTheKeyboard: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const opening = canvas.getByRole('button', { name: 'See City lights' })
    await userEvent.tab()
    await expect(canvas.getByRole('button', { name: 'Play City lights' })).toHaveFocus()
    await userEvent.tab()
    await expect(opening).toHaveFocus()
    // The ring is drawn by the part of the button stretched over the row.
    const ring = canvasElement.ownerDocument.defaultView?.getComputedStyle(opening, '::after')
    await expect(ring?.outlineStyle).toBe('solid')
    await expect(ring?.position).toBe('absolute')

    await userEvent.keyboard('{Enter}')

    await expect(usePlaylistsStore.getState().shownPlaylist).toBe(cityLights.fileName)
  }
}

/** The pointer shows the row is clickable all over, up to its very edge. */
export const ClickableAllOver: Story = {
  play: async ({ canvas, canvasElement }) => {
    const row = canvas.getByRole('listitem')
    const view = canvasElement.ownerDocument.defaultView
    const cursorAt = (element: Element) => view?.getComputedStyle(element).cursor

    await expect(cursorAt(elementAtTheRowStart(row))).toBe('pointer')
    await expect(cursorAt(elementAtTheMiddleOf(canvas.getByText('City lights')))).toBe('pointer')
  }
}

/**
 * Its own controls sit above the row: the menu does its own job, the alert only says why, and
 * neither opens the playlist.
 */
export const ButtonsAboveTheRow: Story = {
  args: { playlist: { ...cityLights, allSongsFound: false } },
  beforeEach: () => {
    shiftMissing()
    mockCommands({
      check_playlist: () => ({
        playlist: { ...cityLights, allSongsFound: false },
        missingSongs: ['Shift.mp3']
      }),
      read_cover: noCover
    })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const menu = canvas.getByRole('button', { name: 'More for City lights' })
    await expect(elementAtTheMiddleOf(menu).closest('button')).toBe(menu)

    await userEvent.click(canvas.getByRole('img', { name: 'Some songs are missing' }))
    await expect(usePlaylistsStore.getState().shownPlaylist).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'More for City lights' }))

    // The menu fades in.
    const opened = await within(canvasElement.ownerDocument.body).findByRole('menu')
    await waitFor(() => expect(opened).toBeVisible())
    await expect(usePlaylistsStore.getState().shownPlaylist).toBeNull()
  }
}

/**
 * Its menu holds Edit playlist, then Delete playlist, each handing the playlist on. Recheck songs
 * shows only while songs are missing.
 */
export const Menu: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'More for City lights' }))

    const items = await page.findAllByRole('menuitem')
    await expect(items.map(item => item.textContent)).toEqual(['Edit playlist', 'Delete playlist'])

    await userEvent.click(page.getByRole('menuitem', { name: 'Edit playlist' }))
    await expect(args.onEdit).toHaveBeenCalledOnce()

    await userEvent.click(canvas.getByRole('button', { name: 'More for City lights' }))
    await userEvent.click(await page.findByRole('menuitem', { name: 'Delete playlist' }))
    await waitFor(() => expect(args.onDelete).toHaveBeenCalledOnce())
    await expect(usePlaylistsStore.getState().shownPlaylist).toBeNull()
  }
}

/**
 * While songs are missing, the menu starts with Recheck songs, which looks for them in the Songs
 * folder again; once they're all back, the song list is scanned again, and the play button takes
 * the alert's place.
 */
export const RecheckingFromTheMenu: Story = {
  args: { playlist: { ...cityLights, allSongsFound: false } },
  beforeEach: () => {
    shiftMissing()
    mockCommands({
      check_playlist: checkPlaylist,
      load_music_library: () => [know, stealingSociety, wutheringHeights, shift],
      read_cover: noCover
    })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'More for City lights' }))

    const items = await page.findAllByRole('menuitem')
    await expect(items.map(item => item.textContent)).toEqual([
      'Recheck songs',
      'Edit playlist',
      'Delete playlist'
    ])

    await userEvent.click(page.getByRole('menuitem', { name: 'Recheck songs' }))

    await waitFor(() =>
      expect(checkPlaylist).toHaveBeenCalledWith({ fileName: cityLights.fileName })
    )
    await waitFor(() => expect(usePlaylistsStore.getState().playlists[0]?.allSongsFound).toBe(true))
    await expect(await canvas.findByRole('button', { name: 'Play City lights' })).toBeEnabled()
  }
}
