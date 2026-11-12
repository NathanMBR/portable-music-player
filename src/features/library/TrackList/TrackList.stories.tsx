import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
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

const meta = {
  component: TrackList,
  args: { tracks: TRACKS }
} satisfies Meta<typeof TrackList>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A small library, one row per song, in the order the store sorted it. Each row starts with a
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

    await expect(label).toHaveAttribute('title', `${LONG_TITLE} · Angra`)
    await expect(label).toContainElement(canvas.getByText('· Angra'))
    await expect(getComputedStyle(label).textOverflow).toBe('ellipsis')
    await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth)
  }
}
