import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
import { drawCover, noCover, UNTIL_COVER_SHOWS } from '../../../testing/covers'
import { mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { playlistSource, SONGS_SOURCE } from '../../playback/playbackSource'
import { usePlaybackStore } from '../../playback/playbackStore'
import type { Track } from '../types'
import { TrackList } from './TrackList'

const TRACKS: Track[] = [
  { path: 'Songs/Crossing.mp3', title: 'Crossing', artist: 'Angra' },
  { path: 'Songs/Metal Icarus.mp3', title: 'Metal Icarus', artist: 'Angra' },
  { path: 'Songs/Morning Star.mp3', title: 'Morning Star', artist: 'Angra' },
  { path: 'Songs/Mystery Machine.mp3', title: 'Mystery Machine', artist: 'Angra' },
  { path: 'Songs/Weakness of a Man.mp3', title: 'Weakness of a Man', artist: 'Angra' }
]

const LONG_TITLE =
  'The Rage of the Waters (Live, Remastered and Extended Edition with the Bonus Orchestral Introduction)'

const firstTrack: Track = { path: 'Songs/Nova Era.mp3', title: 'Nova Era', artist: 'Angra' }
const secondTrack: Track = { path: 'Songs/Rebirth.mp3', title: 'Rebirth', artist: 'Angra' }

const songInPlayer: Track = { path: 'Songs/Know.mp3', title: 'Know', artist: 'System of a Down' }
const queueWithSongInPlayer: Track[] = [
  { path: "Songs/Low Man's Lyric.mp3", title: "Low Man's Lyric", artist: 'Metallica' },
  songInPlayer,
  {
    path: 'Songs/The Frayed Ends of Sanity.mp3',
    title: 'The Frayed Ends of Sanity',
    artist: 'Metallica'
  }
]

const songFromAPlaylist: Track = {
  path: 'Songs/Hero of the Day.mp3',
  title: 'Hero of the Day',
  artist: 'Metallica'
}
const songsWithOneFromAPlaylist: Track[] = [
  { path: 'Songs/The Four Horsemen.mp3', title: 'The Four Horsemen', artist: 'Metallica' },
  songFromAPlaylist,
  { path: 'Songs/Enter Sandman.mp3', title: 'Enter Sandman', artist: 'Metallica' }
]

/** The computed background of a row that nothing highlights. */
const NO_BACKGROUND = 'rgba(0, 0, 0, 0)'

/** `pen` in the light theme, #2c46d1 (src/index.css). */
const PEN = 'rgb(44, 70, 209)'

/** The square between a row's play button and its title, which holds the song's cover. */
const coverSquareAfter = (playButton: HTMLElement) => {
  const square = playButton.nextElementSibling
  if (!square) {
    throw new Error('The play button has nothing after it')
  }
  return square
}

/** The row a song's title is in. */
const rowOf = (title: HTMLElement) => {
  const row = title.closest('li')
  if (!row) {
    throw new Error('The title is in no row')
  }
  return row
}

const backgroundOf = (element: HTMLElement) => getComputedStyle(element).backgroundColor

/**
 * Waits two frames, for the browser to hover whatever the story drew under its own pointer. In some
 * runs that pointer rests on the story's top-left corner, and the browser hovers what's there a
 * frame after the story renders, which would end a hover the story had started by then.
 */
const untilBrowserPointerSettles = () =>
  new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

const meta = {
  component: TrackList,
  args: { tracks: TRACKS },
  beforeEach: () => {
    mockCommands({ read_cover: noCover })
  }
} satisfies Meta<typeof TrackList>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A small library, one row per song, in the order the Songs view sorted it. Each row starts with a
 * round play button named after its song, then shows the song's title and artist.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    const list = canvas.getByRole('list', { name: 'Songs' })
    await expect(list.children).toHaveLength(TRACKS.length)
    for (const track of TRACKS) {
      await expect(canvas.getByRole('button', { name: `Play ${track.title}` })).toBeVisible()
    }
  }
}

/**
 * Playing a song while another is playing switches to it: only one row at a time shows the pause
 * button, and the highlight of the song in the player moves to that row.
 */
export const SwitchingSongs: Story = {
  args: { tracks: [firstTrack, secondTrack] },
  parameters: renderInOwnFrame(150),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: `Play ${firstTrack.title}` }))
    await userEvent.click(canvas.getByRole('button', { name: `Play ${secondTrack.title}` }))

    const pauseButtons = canvas.getAllByRole('button', { name: /^Pause / })
    await expect(pauseButtons).toHaveLength(1)
    await expect(pauseButtons[0]).toHaveAccessibleName(`Pause ${secondTrack.title}`)
    const currentRows = canvas.getAllByRole('listitem', { current: true })
    await expect(currentRows).toHaveLength(1)
    await expect(currentRows[0]).toBe(rowOf(canvas.getByText(secondTrack.title)))
  }
}

/**
 * The song in the player has its row on a pen tint, with its title and artist in pen, like the
 * current category in the menu: the artist's lighter ink would be too faint on the tint. It stays
 * highlighted while paused, as when the app opens with the song it was left with, so the list
 * always shows which song the player holds. Screen readers hear the row as the current one. The
 * other rows stay plain.
 */
export const SongInPlayer: Story = {
  args: { tracks: queueWithSongInPlayer },
  parameters: renderInOwnFrame(150),
  beforeEach: () => {
    usePlaybackStore.setState({
      session: {
        track: songInPlayer,
        queue: queueWithSongInPlayer,
        playOrder: queueWithSongInPlayer,
        isPlaying: false,
        elapsedSeconds: 0,
        durationSeconds: null,
        source: SONGS_SOURCE
      }
    })
  },
  play: async ({ canvas }) => {
    const title = canvas.getByText(songInPlayer.title)
    const row = rowOf(title)

    await expect(canvas.getByRole('listitem', { current: true })).toBe(row)
    await expect(backgroundOf(row)).not.toBe(NO_BACKGROUND)
    await expect(getComputedStyle(title).color).toBe(PEN)
    // Compared with the highlighted row rather than with no background: the browser's pointer may
    // rest on the first row, which then wears the hover tint.
    for (const otherRow of canvas.getAllByRole('listitem', { current: false })) {
      await expect(backgroundOf(otherRow)).not.toBe(backgroundOf(row))
      await expect(getComputedStyle(otherRow).color).not.toBe(PEN)
    }
  }
}

/**
 * The song in the player plays from a playlist: the Songs view doesn't highlight it, and its play
 * button plays it again from here, with the whole list as the queue, which then highlights it.
 */
export const SongPlayingFromAPlaylist: Story = {
  args: { tracks: songsWithOneFromAPlaylist },
  parameters: renderInOwnFrame(150),
  beforeEach: () => {
    usePlaybackStore.setState({
      session: {
        track: songFromAPlaylist,
        queue: [songFromAPlaylist],
        playOrder: [songFromAPlaylist],
        isPlaying: true,
        elapsedSeconds: 42,
        durationSeconds: 260,
        source: playlistSource('1763600033333-Rainy_evening.json')
      }
    })
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByRole('listitem', { current: true })).toBeNull()
    await expect(canvas.queryByRole('button', { name: /^Pause / })).toBeNull()

    await userEvent.click(canvas.getByRole('button', { name: `Play ${songFromAPlaylist.title}` }))

    await expect(usePlaybackStore.getState().session).toMatchObject({
      track: songFromAPlaylist,
      queue: songsWithOneFromAPlaylist,
      elapsedSeconds: 0,
      source: SONGS_SOURCE
    })
    await expect(canvas.getByRole('listitem', { current: true })).toBe(
      rowOf(canvas.getByText(songFromAPlaylist.title))
    )
  }
}

/**
 * The mouse over a song's row tints the whole row, the way it tints the menu's categories, so the
 * eye can follow a long row to its play button. The tint follows the mouse from row to row.
 */
export const HoveredSong: Story = {
  args: {
    tracks: [
      { path: 'Songs/B.Y.O.B..mp3', title: 'B.Y.O.B.', artist: 'System of a Down' },
      { path: 'Songs/Unfinished Allegro.mp3', title: 'Unfinished Allegro', artist: 'Angra' }
    ]
  },
  play: async ({ canvas, userEvent }) => {
    const firstRow = rowOf(canvas.getByText('B.Y.O.B.'))
    const secondRow = rowOf(canvas.getByText('Unfinished Allegro'))
    await untilBrowserPointerSettles()

    await userEvent.hover(firstRow)
    await expect(backgroundOf(firstRow)).not.toBe(NO_BACKGROUND)
    await expect(backgroundOf(secondRow)).toBe(NO_BACKGROUND)

    // Ending on a hovered row lets the accessibility check measure the artist's contrast on the tint.
    await userEvent.hover(secondRow)
    await expect(backgroundOf(firstRow)).toBe(NO_BACKGROUND)
    await expect(backgroundOf(secondRow)).not.toBe(NO_BACKGROUND)
  }
}

/**
 * A song whose tags name its artist shows the artist after the title, past a middle dot. The dot
 * and the artist are in a lighter ink than the title, and hovering shows "Title · Artist". The
 * play button stays named after the title alone.
 */
export const SongWithArtist: Story = {
  args: { tracks: [{ path: 'Songs/Ashes.mp3', title: 'Ashes', artist: 'Angra' }] },
  play: async ({ canvas }) => {
    const title = canvas.getByText('Ashes')
    const artist = canvas.getByText('· Angra')

    await expect(canvas.getByRole('listitem')).toHaveTextContent('Ashes · Angra')
    await expect(title).toHaveAttribute('title', 'Ashes · Angra')
    await expect(getComputedStyle(artist).color).not.toBe(getComputedStyle(title).color)
    await expect(canvas.getByRole('button', { name: 'Play Ashes' })).toBeVisible()
  }
}

/** A song whose tags name no artist shows its title alone, without the middle dot. */
export const SongWithoutArtist: Story = {
  args: { tracks: [{ path: 'Songs/Iron Soul.mp3', title: 'Iron Soul', artist: null }] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('listitem')).toHaveTextContent(/^Iron Soul$/)
    await expect(canvas.getByText('Iron Soul')).toHaveAttribute('title', 'Iron Soul')
  }
}

/**
 * A title too long for its row is cut with an ellipsis, artist and all, so the row stays one line.
 * Hovering the title shows it whole, with the artist.
 */
export const LongTitle: Story = {
  args: { tracks: [{ path: `Songs/${LONG_TITLE}.mp3`, title: LONG_TITLE, artist: 'Angra' }] },
  decorators: [
    Story => (
      <div className="max-w-xs">
        <Story />
      </div>
    )
  ],
  play: async ({ canvas }) => {
    const label = canvas.getByText(LONG_TITLE)
    const coverBox = coverSquareAfter(canvas.getByRole('button')).getBoundingClientRect()

    await expect(label).toHaveAttribute('title', `${LONG_TITLE} · Angra`)
    await expect(label).toContainElement(canvas.getByText('· Angra'))
    await expect(getComputedStyle(label).textOverflow).toBe('ellipsis')
    await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth)
    await expect(coverBox.width).toBe(coverBox.height)
  }
}

/**
 * A song with an embedded cover shows a miniature of it between the play button and the title.
 * The square is no taller than the play button, so the row stays as tall as one without a cover.
 */
export const SongWithCover: Story = {
  args: { tracks: [{ path: 'Songs/Gentle Change.mp3', title: 'Gentle Change', artist: 'Angra' }] },
  parameters: renderInOwnFrame(80),
  beforeEach: () => {
    mockCommands({ read_cover: drawCover })
  },
  play: async ({ canvas }) => {
    const playButton = canvas.getByRole('button', { name: 'Play Gentle Change' })
    const square = coverSquareAfter(playButton)

    await expect(square.nextElementSibling).toBe(canvas.getByText('Gentle Change'))
    await waitFor(
      () => expect(square.querySelector('img')?.naturalWidth).toBeGreaterThan(0),
      UNTIL_COVER_SHOWS
    )
    const squareBox = square.getBoundingClientRect()
    await expect(squareBox.width).toBe(squareBox.height)
    await expect(squareBox.height).toBeLessThanOrEqual(playButton.getBoundingClientRect().height)
  }
}

/**
 * A song without a cover shows a photo icon in its square instead, in the same place and at the
 * same size.
 */
export const SongWithoutCover: Story = {
  args: { tracks: [{ path: 'Songs/Cure.mp3', title: 'Cure', artist: 'Metallica' }] },
  parameters: renderInOwnFrame(80),
  play: async ({ canvas }) => {
    const square = coverSquareAfter(canvas.getByRole('button', { name: 'Play Cure' }))

    await expect(square.nextElementSibling).toBe(canvas.getByText('Cure'))
    await waitFor(() => expect(square.querySelector('svg')).toBeVisible(), UNTIL_COVER_SHOWS)
    await expect(square.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    await expect(square.querySelector('img')).toBeNull()
  }
}
