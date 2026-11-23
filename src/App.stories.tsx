import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { App } from './App'
import { useLibraryStore } from './features/library/libraryStore'
import type { Track } from './features/library/types'
import { useNavigationStore } from './features/navigation/navigationStore'
import { DISMISS_LABEL } from './features/notifications/constants'
import { usePlaybackStore } from './features/playback/playbackStore'
import { usePlaylistsStore } from './features/playlists/playlistsStore'
import type { SavedPlaylist } from './features/playlists/types'
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

const stormyWeather: SavedPlaylist = {
  fileName: '1763600066666-Stormy_weather.json',
  title: 'Stormy weather',
  description: '',
  allSongsFound: true,
  songs: ['Ride Into The Storm.mp3', 'Streets of Tomorrow.mp3']
}

/** The list of playlists on screen. */
const onThePlaylists = () => {
  useNavigationStore.setState({ currentCategory: 'playlists' })
  usePlaylistsStore.setState({ playlists: [stormyWeather], loadStatus: 'loaded' })
}

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

/**
 * On the list of playlists, notifications pop up above the New playlist button, like this play
 * blocked by missing songs.
 */
export const NotifiesAboveTheNewPlaylistButton: Story = {
  beforeEach: () => {
    onThePlaylists()
    mockCommands({ check_playlist: () => ({ playlist: stormyWeather, missingCount: 1 }) })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', { name: 'Play Stormy weather' }))

    const newPlaylist = canvas.getByRole('button', { name: 'New playlist' })
    await waitFor(() => {
      const notification = page
        .getByText('1 song is missing from the Songs folder.')
        .closest('[data-sonner-toast]')
      expect(notification?.getBoundingClientRect().bottom).toBeLessThan(
        newPlaylist.getBoundingClientRect().top
      )
    })
  }
}

/** While the player is open, the New playlist button floats above it. */
export const KeepsTheNewPlaylistButtonAboveThePlayer: Story = {
  beforeEach: () => {
    onThePlaylists()
    loadPlayingSong()
  },
  play: async ({ canvas }) => {
    const player = canvas.getByRole('region', { name: 'Player' })
    const newPlaylist = canvas.getByRole('button', { name: 'New playlist' })

    await waitFor(() =>
      expect(newPlaylist.getBoundingClientRect().bottom).toBeLessThan(
        player.getBoundingClientRect().top
      )
    )
  }
}

/** The center of the element, where a pointer would hit it. */
const centerOf = (element: Element) => {
  const box = element.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

/**
 * Coming to the list of playlists while the player is open, the New playlist button slides up
 * from behind the player, which stays on top of it until the button clears it.
 */
export const SlidesTheNewPlaylistButtonFromBehindThePlayer: Story = {
  beforeEach: () => {
    loadPlayingSong()
  },
  play: async ({ canvas, canvasElement }) => {
    const player = canvas.getByRole('region', { name: 'Player' })
    useNavigationStore.getState().selectCategory('playlists')
    const newPlaylist = await canvas.findByRole('button', { name: 'New playlist' })
    const box = newPlaylist.parentElement
    const slide = await waitFor(() => {
      const running = box
        ?.getAnimations()
        .find(
          (animation): animation is CSSTransition =>
            animation instanceof CSSTransition && animation.transitionProperty === 'translate'
        )
      if (!running) {
        throw new Error('The New playlist button is not sliding')
      }
      return running
    })

    // Holds the slide at the first moment the button's center is over the player.
    slide.pause()
    const playerBox = player.getBoundingClientRect()
    const duration = Number(slide.effect?.getTiming().duration)
    for (let time = 0; time < duration && centerOf(newPlaylist).y > playerBox.bottom; time += 10) {
      slide.currentTime = time
    }
    const center = centerOf(newPlaylist)
    const hit = canvasElement.ownerDocument.elementFromPoint(center.x, center.y)
    slide.play()

    await expect(center.y).toBeLessThan(playerBox.bottom)
    await expect(player.contains(hit)).toBe(true)
  }
}

type Slide = { duration: EffectTiming['duration']; easing: EffectTiming['easing'] }

/** How the element is moving right now through a CSS transition of the property, if it is. */
const runningSlide = (element: Element, property: string): Slide | undefined => {
  const transition = element
    .getAnimations()
    .find(
      animation =>
        animation instanceof CSSTransition &&
        animation.transitionProperty === property &&
        animation.playState === 'running'
    )
  const timing = transition?.effect?.getTiming()
  return timing && { duration: timing.duration, easing: timing.easing }
}

/** Sonner's list holding the notifications, which its bottom offset moves as a whole. */
const notificationsAround = (notificationText: Element) => {
  const notifications = notificationText.closest('[data-sonner-toaster]')
  if (notifications === null) {
    throw new Error('The notification is outside Sonner’s list of notifications')
  }
  return notifications
}

// The player slides with the translate property (translate-y-full).
const PLAYER_SLIDE_PROPERTY = 'translate'

const expectToSlideWithThePlayer = async (notifications: Element, player: Element) => {
  await waitFor(() => {
    const playerSlide = runningSlide(player, PLAYER_SLIDE_PROPERTY)
    expect(playerSlide).toBeDefined()
    expect(runningSlide(notifications, 'bottom')).toEqual(playerSlide)
  })
}

/**
 * Notifications showing while the player slides up or away move with it, over the same time and
 * curve, instead of jumping to their new place.
 */
export const NotificationsSlideWithThePlayer: Story = {
  beforeEach: () => {
    mockCommands({ open_songs_folder: failingCommand(OPEN_FOLDER_ERROR), read_cover: noCover })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', { name: 'Open folder' }))
    await waitFor(() => expect(page.getByText(OPEN_FOLDER_ERROR)).toBeVisible())
    const notifications = notificationsAround(page.getByText(OPEN_FOLDER_ERROR))

    await userEvent.click(canvas.getByRole('button', { name: `Play ${playingTrack.title}` }))
    const player = await canvas.findByRole('region', { name: 'Player' })
    await expectToSlideWithThePlayer(notifications, player)
    // A slide cut short turns back almost at once, so the player is stopped once it's fully open.
    await waitFor(() => expect(runningSlide(player, PLAYER_SLIDE_PROPERTY)).toBeUndefined())

    await userEvent.click(canvas.getByRole('button', { name: 'Stop' }))
    await expectToSlideWithThePlayer(notifications, player)
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
