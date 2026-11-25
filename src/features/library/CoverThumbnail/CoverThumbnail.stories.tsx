import { QueueListIcon } from '@heroicons/react/20/solid'
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import type { InvokeArgs } from '@tauri-apps/api/core'
import { expect, fn, waitFor, within } from 'storybook/test'
import { drawCover, noCover, UNTIL_COVER_SHOWS } from '../../../testing/covers'
import { failingCommand, mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { withNotificationArea } from '../../../testing/withNotificationArea'
import { COVER_READ_DELAY_MS } from '../constants'
import { CoverThumbnail } from './CoverThumbnail'

const SONG_MISSING = "Couldn't find Songs/Speed.mp3: it may have been moved, renamed or deleted"

const readCover = fn(noCover)

// Rust is still reading the cover from a slow drive.
const readCoverForever = fn(() => new Promise<never>(() => undefined))

// Bytes the webview can't draw, like a TIFF or a damaged picture.
const notAnImage = () => new TextEncoder().encode('not an image').buffer

const requestedPath = (args?: InvokeArgs) => (args as { path: string }).path

// Deer Dance has no cover, and the songs after it each have one.
const readCoversAfterDeerDance = fn((args?: InvokeArgs) =>
  requestedPath(args) === 'Songs/Deer Dance.mp3' ? noCover() : drawCover()
)

const imageIn = (element: HTMLElement) => element.querySelector('img')

const placeholderIn = (element: HTMLElement) => element.querySelector('svg')

const sleep = (milliseconds: number) =>
  new Promise<void>(resolve => {
    setTimeout(resolve, milliseconds)
  })

const nextFrame = () =>
  new Promise<void>(resolve => {
    requestAnimationFrame(() => resolve())
  })

// A whole window's height above the square, so it starts out of sight, until the story scrolls to
// it. The square is then the story root's last element.
const belowTheWindow: Decorator = Story => (
  <>
    <div className="h-[200vh]" />
    <Story />
  </>
)

// Each story mocks read_cover in its own way, and Docs pages would share one mock between them.
const meta = {
  component: CoverThumbnail,
  parameters: renderInOwnFrame(100)
} satisfies Meta<typeof CoverThumbnail>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A song with an embedded cover: the square shows it, cropped to fill the square whatever its
 * shape. The image is decorative, since the song's title sits next to it.
 */
export const WithCover: Story = {
  args: { paths: ['Songs/A Monster in Her Eyes.mp3'] },
  beforeEach: () => {
    mockCommands({ read_cover: drawCover })
  },
  play: async ({ canvasElement }) => {
    await waitFor(
      () => expect(imageIn(canvasElement)?.naturalWidth).toBeGreaterThan(0),
      UNTIL_COVER_SHOWS
    )
    const image = imageIn(canvasElement)
    const imageBox = image?.getBoundingClientRect()

    await expect(image).toHaveAttribute('alt', '')
    await expect(image && getComputedStyle(image).objectFit).toBe('cover')
    await expect(imageBox?.width).toBe(imageBox?.height)
  }
}

/** A song without a cover: the square shows a photo icon, which screen readers skip. */
export const WithoutCover: Story = {
  args: { paths: ['Songs/Angels and Demons.mp3'] },
  beforeEach: () => {
    mockCommands({ read_cover: noCover })
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(placeholderIn(canvasElement)).not.toBeNull(), UNTIL_COVER_SHOWS)

    await expect(placeholderIn(canvasElement)).toHaveAttribute('aria-hidden', 'true')
    await expect(imageIn(canvasElement)).toBeNull()
  }
}

/**
 * While Rust reads the cover from the drive, the square stays empty, so no placeholder flashes
 * before a cover arrives.
 */
export const WhileReading: Story = {
  args: { paths: ['Songs/What You Are.mp3'] },
  beforeEach: () => {
    mockCommands({ read_cover: readCoverForever })
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(readCoverForever).toHaveBeenCalledOnce(), UNTIL_COVER_SHOWS)

    await expect(imageIn(canvasElement)).toBeNull()
    await expect(placeholderIn(canvasElement)).toBeNull()
  }
}

/**
 * A picture the webview can't draw, like a TIFF or damaged bytes, shows the placeholder, as if the
 * song had no cover.
 */
export const UnreadablePicture: Story = {
  args: { paths: ['Songs/Winds of Destination.mp3'] },
  beforeEach: () => {
    mockCommands({ read_cover: notAnImage })
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(placeholderIn(canvasElement)).not.toBeNull(), UNTIL_COVER_SHOWS)

    await expect(imageIn(canvasElement)).toBeNull()
  }
}

/**
 * Songs that stand for something without a cover of its own, like a playlist: the square shows the
 * cover of the first song that has one. It reads their covers in order, and none past that song.
 */
export const FirstCoverAmongSongs: Story = {
  args: { paths: ['Songs/Deer Dance.mp3', 'Songs/Shift.mp3', 'Songs/Tears Of Blood.mp3'] },
  beforeEach: () => {
    mockCommands({ read_cover: readCoversAfterDeerDance })
  },
  play: async ({ canvasElement }) => {
    await waitFor(
      () => expect(imageIn(canvasElement)?.naturalWidth).toBeGreaterThan(0),
      UNTIL_COVER_SHOWS
    )

    await expect(readCoversAfterDeerDance.mock.calls.map(([args]) => requestedPath(args))).toEqual([
      'Songs/Deer Dance.mp3',
      'Songs/Shift.mp3'
    ])
  }
}

/** Among songs, a picture the webview can't draw is passed over, for the next song's cover. */
export const UnreadablePictureAmongSongs: Story = {
  args: { paths: ['Songs/...And Justice for All.mp3', 'Songs/Spirit of the Air.mp3'] },
  beforeEach: () => {
    mockCommands({
      read_cover: args =>
        requestedPath(args) === 'Songs/...And Justice for All.mp3' ? notAnImage() : drawCover()
    })
  },
  play: async ({ canvasElement }) => {
    await waitFor(
      () => expect(imageIn(canvasElement)?.naturalWidth).toBeGreaterThan(0),
      UNTIL_COVER_SHOWS
    )
  }
}

/**
 * When none of the songs has a cover, the square shows its placeholder once their covers are read,
 * which can be the icon of what they stand for, like a playlist's.
 */
export const NoCoverAmongSongs: Story = {
  args: { paths: ['Songs/Run Boy Run.mp3', 'Songs/Tentative.mp3'], placeholderIcon: QueueListIcon },
  beforeEach: () => {
    mockCommands({ read_cover: readCover })
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(placeholderIn(canvasElement)).not.toBeNull(), UNTIL_COVER_SHOWS)

    await expect(readCover).toHaveBeenCalledTimes(2)
    await expect(imageIn(canvasElement)).toBeNull()
  }
}

/**
 * Without songs, like a playlist whose songs are all missing from the Songs folder, the square
 * shows its placeholder at once, and reads nothing.
 */
export const WithoutSongs: Story = {
  args: { paths: [], placeholderIcon: QueueListIcon },
  beforeEach: () => {
    mockCommands({ read_cover: readCover })
  },
  play: async ({ canvasElement }) => {
    await expect(placeholderIn(canvasElement)).not.toBeNull()

    await sleep(COVER_READ_DELAY_MS * 2)
    await expect(readCover).not.toHaveBeenCalled()
  }
}

/**
 * A cover Rust couldn't read, because the song vanished or the drive was pulled, shows the
 * placeholder, and a notification says why. Every failed cover replaces that one notification,
 * so a pulled drive doesn't raise one per row.
 */
export const FailedRead: Story = {
  args: { paths: ['Songs/Speed.mp3'] },
  decorators: [withNotificationArea],
  beforeEach: () => {
    mockCommands({ read_cover: failingCommand(SONG_MISSING) })
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)

    await waitFor(() => expect(page.getByText(SONG_MISSING)).toBeVisible(), UNTIL_COVER_SHOWS)
    await expect(page.getByText("Couldn't load a cover")).toBeVisible()
    await expect(placeholderIn(canvasElement)).not.toBeNull()
  }
}

/**
 * A square out of sight reads no cover: the cover is read only once the square is scrolled on
 * screen, so a long list reads only the covers it shows.
 */
export const ReadOnlyOnScreen: Story = {
  args: { paths: ['Songs/Horizons into Battlegrounds.mp3'] },
  decorators: [belowTheWindow],
  beforeEach: () => {
    mockCommands({ read_cover: readCover })
  },
  play: async ({ canvasElement }) => {
    await sleep(COVER_READ_DELAY_MS * 2)
    await expect(readCover).not.toHaveBeenCalled()

    canvasElement.lastElementChild?.scrollIntoView()

    await waitFor(() => expect(readCover).toHaveBeenCalledOnce(), UNTIL_COVER_SHOWS)
  }
}

/**
 * A square that a fast scroll only flies past reads no cover: it has to stay on screen for a
 * moment first, so scrolling through a long list doesn't make Rust read every song on the way.
 */
export const SkipsCoversScrolledPast: Story = {
  args: { paths: ['Songs/Dyers Eve.mp3'] },
  decorators: [belowTheWindow],
  beforeEach: () => {
    mockCommands({ read_cover: readCover })
  },
  play: async ({ canvasElement }) => {
    canvasElement.lastElementChild?.scrollIntoView()
    // Two frames, so the webview has seen the square on screen.
    await nextFrame()
    await nextFrame()
    canvasElement.ownerDocument.defaultView?.scrollTo(0, 0)

    await sleep(COVER_READ_DELAY_MS * 2)
    await expect(readCover).not.toHaveBeenCalled()
  }
}
