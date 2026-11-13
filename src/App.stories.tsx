import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { App } from './App'
import { useLibraryStore } from './features/library/libraryStore'
import type { Track } from './features/library/types'
import { DISMISS_LABEL } from './features/notifications/constants'
import { usePlaybackStore } from './features/playback/playbackStore'
import { noCover } from './testing/covers'
import { failingCommand, mockCommands } from './testing/mockCommands'
import { renderInOwnFrame } from './testing/storyParameters'

const playingTrack: Track = {
  path: 'Songs/Running Alone.mp3',
  title: 'Running Alone',
  artist: 'Angra'
}

const TRACKS: Track[] = [
  { path: 'Songs/In Excelsis.mp3', title: 'In Excelsis', artist: 'Angra' },
  { path: 'Songs/Ride Into The Storm.mp3', title: 'Ride Into The Storm', artist: 'Angra' },
  playingTrack,
  { path: 'Songs/Streets of Tomorrow.mp3', title: 'Streets of Tomorrow', artist: 'Angra' },
  { path: 'Songs/Unholy Wars.mp3', title: 'Unholy Wars', artist: 'Angra' }
]

// Enough songs to scroll past the bottom of the window.
const LONG_LIST: Track[] = [
  'Lease of Life',
  'Nothing To Say',
  'Evil Warning',
  'The Shadow Hunter',
  'Holy Land',
  'Lisbon',
  'Vida Seca',
  'Lasting Child',
  'Crossing',
  'Ashes',
  'Silence and Distance',
  'In Excelsis',
  'Wuthering Heights',
  'Paradise',
  'Heroes of Sand',
  'Generation Warriors',
  'Never Understand',
  'Faithless Sanctuary',
  'Tears Of Blood',
  'Deus Le Volt!',
  'Stand Away',
  'Unholy Wars',
  'Cycles Of Pain',
  'Arising Thunder',
  'Ride Into The Storm',
  'A Monster in Her Eyes',
  'Spread Your Fire',
  'Tide Of Changes',
  'Carry On',
  'Angels and Demons'
].map(title => ({ path: `Songs/${title}.mp3`, title, artist: 'Angra' }))

const SAVE_ERROR =
  "Couldn't save the settings at /media/usb/settings.json: Read-only file system (os error 30)"

const OPEN_FOLDER_ERROR = "Couldn't open the Songs folder: no application can open folders"

/** A song of the list loaded in the player, as if played from its row. */
const loadPlayingSong = () => {
  usePlaybackStore.setState({
    session: {
      track: playingTrack,
      queue: TRACKS,
      playOrder: TRACKS,
      isPlaying: true,
      elapsedSeconds: 0,
      durationSeconds: null
    }
  })
}

const meta = {
  component: App,
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(560) },
  beforeEach: () => {
    mockCommands({
      load_music_library: () => TRACKS,
      open_songs_folder: () => undefined,
      save_settings: () => undefined,
      read_cover: noCover
    })
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: TRACKS } })
  }
} satisfies Meta<typeof App>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The whole window: the current category's view, with the menu button in its left margin and an
 * equal margin on the right. The songs keep that width when they all fit and nothing scrolls.
 */
export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    const windowWidth = canvasElement.ownerDocument.defaultView?.innerWidth ?? 0
    const listBox = canvas.getByRole('list', { name: 'Songs' }).getBoundingClientRect()

    await expect(windowWidth - listBox.right).toBe(listBox.left)
  }
}

/** The menu button opens the side menu, and choosing a category closes it on that view. */
export const NavigatesFromTheSideMenu: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', { name: 'Open menu' }))
    await userEvent.click(await page.findByRole('button', { name: 'Settings' }))

    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
    await expect(canvas.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(canvas.queryByRole('heading', { name: 'Songs' })).not.toBeInTheDocument()
  }
}

/**
 * A failure raised from inside the open side menu, like a theme that can't be saved, pops up above
 * the menu and can be dismissed, although the menu makes the rest of the page inert.
 */
export const NotifiesAboveTheSideMenu: Story = {
  beforeEach: () => {
    mockCommands({
      load_music_library: () => TRACKS,
      save_settings: failingCommand(SAVE_ERROR),
      read_cover: noCover
    })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', { name: 'Open menu' }))
    await userEvent.click(await page.findByRole('switch', { name: 'Dark theme' }))

    await waitFor(() => expect(page.getByText(SAVE_ERROR)).toBeVisible())
    await expect(page.getByText(SAVE_ERROR).closest('[inert]')).toBeNull()

    await userEvent.click(page.getByRole('button', { name: DISMISS_LABEL }))
    await waitFor(() => expect(page.queryByText(SAVE_ERROR)).not.toBeInTheDocument())
  }
}

/** Playing a song from its row slides the player up from the bottom of the window. */
export const ShowsThePlayerWhenASongPlays: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: `Play ${playingTrack.title}` }))

    const player = await canvas.findByRole('region', { name: 'Player' })
    await expect(player).toBeVisible()
    await expect(within(player).getByText(playingTrack.title)).toBeVisible()
  }
}

/** The player sits outside the views, so the song keeps playing when the category changes. */
export const KeepsPlayingAcrossCategories: Story = {
  beforeEach: loadPlayingSong,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', { name: 'Open menu' }))
    await userEvent.click(await page.findByRole('button', { name: 'Settings' }))
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
    await expect(canvas.getByRole('heading', { name: 'Settings' })).toBeVisible()

    const player = canvas.getByRole('region', { name: 'Player' })
    await expect(within(player).getByText(playingTrack.title)).toBeVisible()
    await expect(within(player).getByRole('button', { name: 'Pause' })).toBeVisible()
  }
}

/**
 * While the player is open, notifications pop up above it instead of covering it, like this
 * failure to open the Songs folder.
 */
export const NotifiesAboveThePlayer: Story = {
  beforeEach: () => {
    mockCommands({ open_songs_folder: failingCommand(OPEN_FOLDER_ERROR), read_cover: noCover })
    loadPlayingSong()
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', { name: 'Open folder' }))

    const player = canvas.getByRole('region', { name: 'Player' })
    // Notifications slide in, so their place is checked once they've settled.
    await waitFor(() => {
      const notification = page.getByText(OPEN_FOLDER_ERROR).closest('[data-sonner-toast]')
      expect(notification?.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        player.getBoundingClientRect().top
      )
    })
  }
}

// The app's own scrollbar, as thin as the sliders' track. The browser's own is wider.
const SCROLLBAR_WIDTH = 6

/**
 * A list too long for the window scrolls on its own, from under the header down to the window's
 * bottom edge. The songs keep the width between the two margins, and the app's own scrollbar sits
 * in the right margin, beside them. While a song is in the player, the list ends above the player
 * instead, and it reaches the bottom edge again once the player is stopped.
 */
export const ScrollsOnlyTheSongs: Story = {
  beforeEach: () => {
    mockCommands({ load_music_library: () => LONG_LIST, read_cover: noCover })
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: LONG_LIST } })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const window = canvasElement.ownerDocument.defaultView
    const windowWidth = window?.innerWidth ?? 0
    const page = canvasElement.ownerDocument.documentElement
    const songs = canvas.getByRole('main')
    const songsBox = songs.getBoundingClientRect()
    const listBox = canvas.getByRole('list', { name: 'Songs' }).getBoundingClientRect()
    const headerBox = canvas.getByRole('banner').getBoundingClientRect()
    const scrollbarWidth = songs.offsetWidth - songs.clientWidth
    const scrollbarLeft = songsBox.right - scrollbarWidth

    await expect(page.scrollHeight).toBe(page.clientHeight)
    await expect(songs.scrollHeight).toBeGreaterThan(songs.clientHeight)
    await expect(songsBox.top).toBe(headerBox.bottom)
    await expect(songsBox.bottom).toBe(window?.innerHeight)

    await expect(windowWidth - listBox.right).toBe(listBox.left)
    await expect([headerBox.left, headerBox.right]).toEqual([listBox.left, listBox.right])
    await expect(scrollbarWidth).toBe(SCROLLBAR_WIDTH)
    await expect(scrollbarLeft).toBeGreaterThan(listBox.right)
    await expect(scrollbarLeft - listBox.right).toBeLessThan(windowWidth - songsBox.right)

    await userEvent.click(canvas.getByRole('button', { name: 'Play Lease of Life' }))

    const player = await canvas.findByRole('region', { name: 'Player' })
    // The player slides up, so its place is checked once it has settled at the bottom edge.
    await waitFor(() => {
      const playerBox = player.getBoundingClientRect()
      expect(playerBox.bottom).toBe(window?.innerHeight)
      expect(songs.getBoundingClientRect().bottom).toBe(playerBox.top)
    })

    await userEvent.click(canvas.getByRole('button', { name: 'Stop' }))

    await waitFor(() => expect(songs.getBoundingClientRect().bottom).toBe(window?.innerHeight))
  }
}
