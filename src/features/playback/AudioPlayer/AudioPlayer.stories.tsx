import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import type { Track } from '../../library/types'
import { usePlaylistsStore } from '../../playlists/playlistsStore'
import { playlistSource, SONGS_SOURCE } from '../playbackSource'
import { type PlaybackSession, usePlaybackStore } from '../playbackStore'
import { AudioPlayer } from './AudioPlayer'

const firstTrack: Track = {
  path: 'Songs/Angels and Demons.mp3',
  title: 'Angels and Demons',
  artist: 'Angra'
}
const secondTrack: Track = {
  path: 'Songs/A Monster in Her Eyes.mp3',
  title: 'A Monster in Her Eyes',
  artist: 'Angra'
}
const thirdTrack: Track = {
  path: 'Songs/Silence and Distance.mp3',
  title: 'Silence and Distance',
  artist: 'Angra'
}
const queue = [firstTrack, secondTrack, thirdTrack]

// While the name slides, a copy of it follows, hidden from screen readers: queries skip it.
const COPY_SELECTOR = '[aria-hidden="true"]'
const SKIPPING_THE_COPY = { ignore: `${COPY_SELECTOR} *` }

/** The song's name titled `title`, as the line shows it, not the copy that follows it. */
const nameTitled = (scope: ReturnType<typeof within>, title: string) => {
  const name = scope
    .getAllByTitle(title)
    .find((element: HTMLElement) => !element.closest(COPY_SELECTOR))
  if (!name) {
    throw new Error(`No name titled "${title}"`)
  }
  return name
}

/** The marquee the song's name slides through, which spans the line above the progress. */
const nameFrameOf = (name: HTMLElement) => {
  const frame = name.parentElement?.parentElement?.parentElement
  if (!frame) {
    throw new Error('The name sits outside its marquee')
  }
  return frame
}

const ROAD_TRIP = '1763600000000-Road_trip.json'

/** The song is played from the playlist Road trip. */
const loadSessionFromRoadTrip = (overrides: Partial<PlaybackSession> = {}) => {
  usePlaylistsStore.setState({
    playlists: [
      {
        fileName: ROAD_TRIP,
        title: 'Road trip',
        description: '',
        allSongsFound: true,
        songs: ['A Monster in Her Eyes.mp3']
      }
    ],
    loadStatus: 'loaded'
  })
  loadSession({ source: playlistSource(ROAD_TRIP), ...overrides })
}

const LONG_TITLE =
  'Deus Le Volt! (Live in São Paulo, Remastered with the Full Orchestral Prelude and a Bonus Reprise)'

/** The second song of the queue, playing 1:23 into its 4:30, unless overridden. */
const loadSession = (overrides: Partial<PlaybackSession> = {}) => {
  usePlaybackStore.setState({
    session: {
      track: secondTrack,
      queue,
      playOrder: queue,
      isPlaying: true,
      elapsedSeconds: 83,
      durationSeconds: 270,
      source: SONGS_SOURCE,
      ...overrides
    }
  })
}

const meta = {
  component: AudioPlayer,
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(120) }
} satisfies Meta<typeof AudioPlayer>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A song is playing: the controls on the left, its title above the progress bar in the middle,
 * and the volume on the right.
 */
export const Playing: Story = {
  beforeEach: () => {
    loadSession()
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('region', { name: 'Player' })).toBeVisible()
    await expect(canvas.getByText(secondTrack.title, SKIPPING_THE_COPY)).toBeVisible()
  }
}

/** A song whose tags name its artist shows it after the title, behind a middle dot, as in the list. */
export const WithArtist: Story = {
  beforeEach: () => {
    const soHandsomeHello: Track = {
      path: 'Songs/So Handsome Hello.mp3',
      title: 'So Handsome Hello',
      artist: 'Woodkid'
    }
    loadSession({ track: soHandsomeHello, queue: [soHandsomeHello], playOrder: [soHandsomeHello] })
  },
  play: async ({ canvas }) => {
    const player = within(canvas.getByRole('region', { name: 'Player' }))
    const name = nameTitled(player, 'So Handsome Hello · Woodkid')

    await expect(name).toHaveTextContent(/^So Handsome Hello · Woodkid$/)
    // Played from the Songs view, the line names no list.
    await expect(name.parentElement).toHaveTextContent(/^So Handsome Hello · Woodkid$/)
  }
}

/**
 * A song played from a playlist shows the playlist's title last, behind another middle dot, in the
 * artist's type and lighter ink.
 */
export const FromAPlaylist: Story = {
  beforeEach: () => {
    loadSessionFromRoadTrip()
  },
  play: async ({ canvas }) => {
    const shownName = nameTitled(canvas, 'A Monster in Her Eyes · Angra').parentElement

    await expect(shownName).toHaveTextContent(/^A Monster in Her Eyes · Angra · Road trip$/)
    const playlistStyle = getComputedStyle(canvas.getByText(/Road trip$/, SKIPPING_THE_COPY))
    const artistStyle = getComputedStyle(canvas.getByText(/Angra$/, SKIPPING_THE_COPY))

    await expect(playlistStyle.fontStretch).toBe(artistStyle.fontStretch)
    await expect(playlistStyle.color).toBe(artistStyle.color)
    await expect(playlistStyle.fontWeight).toBe(artistStyle.fontWeight)
  }
}

/**
 * The name slides between the start of the left time's digits and the end of the length's, and
 * follows the left time as it switches to the countdown.
 */
export const NameBetweenTheTimes: Story = {
  beforeEach: () => {
    loadSession()
  },
  play: async ({ canvas, userEvent }) => {
    const frame = nameFrameOf(nameTitled(canvas, 'A Monster in Her Eyes · Angra'))
    const leftOf = (element: Element) => element.getBoundingClientRect().left

    await waitFor(() => expect(leftOf(frame)).toBeCloseTo(leftOf(canvas.getByText('01:23'))))
    await expect(frame.getBoundingClientRect().right).toBeCloseTo(
      canvas.getByText('04:30').getBoundingClientRect().right
    )

    await userEvent.click(canvas.getByRole('button', { name: 'Elapsed time 01:23' }))

    await waitFor(() => expect(leftOf(frame)).toBeCloseTo(leftOf(canvas.getByText('-03:07'))))
  }
}

/** A song whose tags name no artist shows its title alone. */
export const WithoutArtist: Story = {
  beforeEach: () => {
    const orion: Track = { path: 'Songs/Orion.mp3', title: 'Orion', artist: null }
    loadSession({ track: orion, queue: [orion], playOrder: [orion] })
  },
  play: async ({ canvas }) => {
    const player = within(canvas.getByRole('region', { name: 'Player' }))

    await expect(nameTitled(player, 'Orion')).toHaveTextContent(/^Orion$/)
  }
}

/** The song is paused: the main button plays it again. */
export const Paused: Story = {
  beforeEach: () => {
    loadSession({ isPlaying: false })
  }
}

/**
 * While the song is paused, its name holds still in the middle of its line, with its playlist.
 * Once the song plays on, it slides from where it stands, and pausing again puts it back in the
 * middle; the line keeps its height throughout.
 */
export const StillWhilePaused: Story = {
  beforeEach: () => {
    loadSessionFromRoadTrip({ isPlaying: false })
  },
  play: async ({ canvas, userEvent }) => {
    const name = canvas.getByTitle('A Monster in Her Eyes · Angra')
    const line = name.closest('p')
    const frame = nameFrameOf(name)
    const middleOf = (element: Element) => {
      const box = element.getBoundingClientRect()
      return box.left + box.width / 2
    }

    const track = name.parentElement as Element
    const slides = () => frame.getAnimations({ subtree: true })
    const lineHeight = line?.getBoundingClientRect().height
    const stillLeft = track.getBoundingClientRect().left

    await expect(line).toHaveTextContent(/^A Monster in Her Eyes · Angra · Road trip$/)
    await expect(slides()).toEqual([])
    await expect(middleOf(track)).toBeCloseTo(middleOf(frame), 0)

    await userEvent.click(canvas.getByRole('button', { name: 'Play' }))
    const slide = await waitFor(() => {
      const [running] = slides()
      if (!running) {
        throw new Error('The name is not sliding')
      }
      return running
    })
    slide.pause()

    await expect(track.getBoundingClientRect().left).toBeCloseTo(stillLeft, -1)
    await expect(line?.getBoundingClientRect().height).toBe(lineHeight)

    slide.play()
    await userEvent.click(canvas.getByRole('button', { name: 'Pause' }))

    await expect(slides()).toEqual([])
    await expect(middleOf(track)).toBeCloseTo(middleOf(frame), 0)
    await expect(line?.getBoundingClientRect().height).toBe(lineHeight)
  }
}

/**
 * While the song's audio loads, its length is unknown: the bar stays empty and disabled, and the
 * length is dashes.
 */
export const UnknownLength: Story = {
  beforeEach: () => {
    loadSession({ elapsedSeconds: 0, durationSeconds: null })
  }
}

/**
 * The name slides from right to left without end, above the progress, so even a name longer than
 * its line passes whole; hovering shows it whole too.
 */
export const LongTitle: Story = {
  beforeEach: () => {
    const longTrack: Track = { path: `Songs/${LONG_TITLE}.mp3`, title: LONG_TITLE, artist: 'Angra' }
    loadSession({ track: longTrack, queue: [longTrack], playOrder: [longTrack] })
  },
  play: async ({ canvas }) => {
    const name = nameTitled(canvas, `${LONG_TITLE} · Angra`)
    const frame = nameFrameOf(name)

    await waitFor(() => expect(frame.getAnimations({ subtree: true })).toHaveLength(1))
    await expect(name.getBoundingClientRect().width).toBeGreaterThan(frame.offsetWidth)
  }
}

/**
 * In a wide window the song's progress stops growing at a set width, and the spaces on either side
 * of it widen equally instead, so the bar stays easy to follow.
 */
export const WideWindow: Story = {
  parameters: {
    viewport: {
      options: {
        wideWindow: { name: 'Wide window', styles: { width: '1920px', height: '1080px' } }
      }
    }
  },
  globals: { viewport: { value: 'wideWindow' } },
  beforeEach: () => {
    loadSession()
  },
  play: async ({ canvas }) => {
    const controls = canvas.getByRole('button', { name: 'Shuffle' }).parentElement
    const progress = canvas
      .getByText(secondTrack.title, SKIPPING_THE_COPY)
      .closest('p')?.parentElement
    const volume = canvas.getByRole('button', { name: 'Mute' }).parentElement
    if (!controls || !progress || !volume) {
      throw new Error('The player lost one of its parts')
    }
    const controlsBox = controls.getBoundingClientRect()
    const progressBox = progress.getBoundingClientRect()
    const volumeBox = volume.getBoundingClientRect()

    await expect(progressBox.width).toBe(Number.parseFloat(getComputedStyle(progress).maxWidth))
    await expect(progressBox.left - controlsBox.right).toBeCloseTo(
      volumeBox.left - progressBox.right
    )
  }
}

/** Before any song is played, the player isn't there at all. */
export const Hidden: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('region', { name: 'Player' })).not.toBeInTheDocument()
  }
}

/**
 * "Next song" and "Previous song" move through the queue, and the title follows. With repeat off,
 * the last song has no next one.
 */
export const SkipsSongs: Story = {
  beforeEach: () => {
    loadSession()
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Next song' }))
    await expect(canvas.getByText(thirdTrack.title, SKIPPING_THE_COPY)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Next song' })).toBeDisabled()

    await userEvent.click(canvas.getByRole('button', { name: 'Previous song' }))
    await expect(canvas.getByText(secondTrack.title, SKIPPING_THE_COPY)).toBeVisible()
  }
}

/**
 * Past a song's first 3 seconds, "Previous song" starts it over, even on the first song of the
 * queue without repeat, where there's no song before it.
 */
export const RestartsTheSong: Story = {
  beforeEach: () => {
    loadSession({ track: firstTrack, elapsedSeconds: 83 })
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Previous song' }))

    await expect(canvas.getByText(firstTrack.title, SKIPPING_THE_COPY)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Elapsed time 00:00' })).toBeVisible()
  }
}

/**
 * In the first 3 seconds of the first song of the queue, without repeat, there's nothing to go
 * back to: "Previous song" is disabled.
 */
export const StartOfTheFirstSong: Story = {
  beforeEach: () => {
    loadSession({ track: firstTrack, elapsedSeconds: 2 })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Previous song' })).toBeDisabled()
  }
}

/** Stop slides the player away, back to the hidden state it had before any song played. */
export const StopHidesThePlayer: Story = {
  beforeEach: () => {
    loadSession()
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Stop' }))

    await waitFor(() =>
      expect(canvas.queryByRole('region', { name: 'Player' })).not.toBeInTheDocument()
    )
  }
}
