import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { noCover } from '../../../testing/covers'
import { mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { useLibraryStore } from '../../library/libraryStore'
import type { Track } from '../../library/types'
import { useNavigationStore } from '../../navigation/navigationStore'
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

// Sonner's notifications slide in over 400ms, with CSS's ease.
const NOTIFICATION_SLIDE: Slide = { duration: 400, easing: 'ease' }

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
 * Coming to the list, it slides up and fades in like a notification, over the same time and
 * curve, and leaving it, it slides back out the same way.
 */
export const SlidesInLikeANotification: Story = {
  beforeEach: () => {
    useNavigationStore.setState({ currentCategory: 'songs' })
  },
  play: async ({ canvas }) => {
    useNavigationStore.getState().selectCategory('playlists')
    const box = floatingBoxOf(await canvas.findByRole('button', { name: 'New playlist' }))
    await waitFor(() => {
      expect(runningSlide(box, 'opacity')).toEqual(NOTIFICATION_SLIDE)
      expect(runningSlide(box, 'translate')).toEqual(NOTIFICATION_SLIDE)
    })
    await waitFor(() => expect(runningSlide(box, 'opacity')).toBeUndefined())

    useNavigationStore.getState().selectCategory('songs')

    await waitFor(() => expect(runningSlide(box, 'opacity')).toEqual(NOTIFICATION_SLIDE))
    await waitFor(() => expect(canvas.queryByRole('button', { name: 'New playlist' })).toBeNull())
  }
}
