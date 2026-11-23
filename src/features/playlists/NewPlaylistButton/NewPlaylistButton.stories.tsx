import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { noCover } from '../../../testing/covers'
import { mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { useLibraryStore } from '../../library/libraryStore'
import type { Track } from '../../library/types'
import { useNavigationStore } from '../../navigation/navigationStore'
import { usePlaybackStore } from '../../playback/playbackStore'
import { usePlaylistsStore } from '../playlistsStore'
import type { SavedPlaylist } from '../types'
import { NewPlaylistButton } from './NewPlaylistButton'

const revelations: Track = {
  path: 'Songs/Revelations.mp3',
  title: 'Revelations',
  artist: 'Audioslave'
}

const garageNights: SavedPlaylist = {
  fileName: '1763600055555-Garage_nights.json',
  title: 'Garage nights',
  description: '',
  allSongsFound: true,
  songs: ['Revelations.mp3', 'Phantom Lord.mp3']
}

type Slide = { duration: EffectTiming['duration']; easing: EffectTiming['easing'] }

// Sonner's notifications slide in over 400ms, with CSS's ease.
const NOTIFICATION_SLIDE: Slide = { duration: 400, easing: 'ease' }

/** The CSS transition of the property the element runs right now, if it runs one. */
const runningTransition = (element: Element, property: string) =>
  element
    .getAnimations()
    .find(
      (animation): animation is CSSTransition =>
        animation instanceof CSSTransition &&
        animation.transitionProperty === property &&
        animation.playState === 'running'
    )

/** The element's slide, the transition of its `translate`, which it must be running. */
const slideOf = (element: Element) => {
  const slide = runningTransition(element, 'translate')
  if (!slide) {
    throw new Error('The button is not sliding')
  }
  return slide
}

const timingOf = (slide: CSSTransition): Slide => {
  const timing = slide.effect?.getTiming()
  return { duration: timing?.duration, easing: timing?.easing }
}

/** Where the element starts its slide from: the slide sent back to its first frame, then resumed. */
const slideStartOf = (element: Element, slide: CSSTransition) => {
  slide.pause()
  slide.currentTime = 0
  const start = element.getBoundingClientRect()
  slide.play()
  return start
}

const windowHeightOf = (canvasElement: HTMLElement) =>
  canvasElement.ownerDocument.defaultView?.innerHeight ?? 0

const floatingBoxOf = (button: HTMLElement) => {
  const box = button.parentElement
  if (!box) {
    throw new Error('The button floats in nothing')
  }
  return box
}

const meta = {
  component: NewPlaylistButton,
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(160) },
  beforeEach: () => {
    useNavigationStore.setState({ currentCategory: 'playlists' })
    usePlaylistsStore.setState({ playlists: [garageNights], loadStatus: 'loaded' })
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: [revelations] } })
    mockCommands({ read_cover: noCover })
  }
} satisfies Meta<typeof NewPlaylistButton>

export default meta
type Story = StoryObj<typeof meta>

/** On the list of playlists, the round button floats in the bottom-right corner. */
export const OnTheList: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'New playlist' })).toBeVisible()
  }
}

/** It opens the New playlist dialog. */
export const OpeningTheDialog: Story = {
  parameters: renderInOwnFrame(720),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'New playlist' }))

    const page = within(canvasElement.ownerDocument.body)
    await expect(await page.findByRole('dialog', { name: 'New playlist' })).toBeVisible()
  }
}

/** On a playlist's page, it isn't there: a new playlist starts from the list. */
export const OnAPlaylist: Story = {
  beforeEach: () => {
    usePlaylistsStore.setState({ shownPlaylist: garageNights.fileName })
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: 'New playlist' })).toBeNull()
  }
}

/** On another page, it isn't there either. */
export const OnAnotherPage: Story = {
  beforeEach: () => {
    useNavigationStore.setState({ currentCategory: 'songs' })
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: 'New playlist' })).toBeNull()
  }
}

/**
 * Coming to the list, it slides up from below the window's bottom edge, over a notification's
 * time and curve, without fading, and leaving it, it slides back down out of the window.
 */
export const SlidesInFromTheBottom: Story = {
  beforeEach: () => {
    useNavigationStore.setState({ currentCategory: 'songs' })
  },
  play: async ({ canvas, canvasElement }) => {
    useNavigationStore.getState().selectCategory('playlists')
    const box = floatingBoxOf(await canvas.findByRole('button', { name: 'New playlist' }))
    const slideIn = await waitFor(() => slideOf(box))

    await expect(timingOf(slideIn)).toEqual(NOTIFICATION_SLIDE)
    await expect(slideStartOf(box, slideIn).top).toBeGreaterThanOrEqual(
      windowHeightOf(canvasElement)
    )
    await expect(runningTransition(box, 'opacity')).toBeUndefined()
    await waitFor(() => expect(runningTransition(box, 'translate')).toBeUndefined())

    useNavigationStore.getState().selectCategory('songs')

    await waitFor(() => expect(timingOf(slideOf(box))).toEqual(NOTIFICATION_SLIDE))
    await expect(runningTransition(box, 'opacity')).toBeUndefined()
    await waitFor(() => expect(canvas.queryByRole('button', { name: 'New playlist' })).toBeNull())
  }
}

/**
 * While the audio player is open, the button floats above it, and still slides in from below the
 * window's bottom edge, passing behind the player.
 */
export const SlidesInFromBelowThePlayer: Story = {
  beforeEach: () => {
    useNavigationStore.setState({ currentCategory: 'songs' })
    usePlaybackStore.getState().playTrack(revelations, [revelations])
  },
  play: async ({ canvas, canvasElement }) => {
    useNavigationStore.getState().selectCategory('playlists')
    const box = floatingBoxOf(await canvas.findByRole('button', { name: 'New playlist' }))
    const slideIn = await waitFor(() => slideOf(box))

    await expect(slideStartOf(box, slideIn).top).toBeGreaterThanOrEqual(
      windowHeightOf(canvasElement)
    )
  }
}
