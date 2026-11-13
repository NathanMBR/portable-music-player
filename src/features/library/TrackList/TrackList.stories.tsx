import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
import { drawCover, noCover, UNTIL_COVER_SHOWS } from '../../../testing/covers'
import { mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
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

/** The square between a row's play button and its title, which holds the song's cover. */
const coverSquareAfter = (playButton: HTMLElement) => {
  const square = playButton.nextElementSibling
  if (!square) throw new Error('The play button has nothing after it')
  return square
}

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
 * button.
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
