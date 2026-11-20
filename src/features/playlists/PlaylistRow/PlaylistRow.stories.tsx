import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { renderInOwnFrame } from '../../../testing/storyParameters'
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

const meta = {
  component: PlaylistRow,
  args: { playlist: cityLights, onDelete: fn() },
  // Rows are list items, so they need a list around them.
  decorators: [
    Story => (
      <ul>
        <Story />
      </ul>
    )
  ]
} satisfies Meta<typeof PlaylistRow>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Its play button, the square of the Playlists icon, the title and description, then See and
 * Delete at the right end.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Play City lights' })).toBeEnabled()
    await expect(canvas.getByTitle('City lights · Late trains and empty streets')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'See City lights' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Delete City lights' })).toBeVisible()
  }
}

/** A playlist without a description shows its title alone. */
export const WithoutDescription: Story = {
  args: { playlist: { ...cityLights, description: '' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByTitle('City lights')).toHaveTextContent(/^City lights$/)
  }
}

/**
 * While its file says songs are missing: a red alert follows the title, the play button is
 * disabled, and a Recheck button follows it.
 */
export const SongsMissing: Story = {
  args: { playlist: { ...cityLights, allSongsFound: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: 'Some songs are missing' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Play City lights' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Recheck City lights' })).toBeVisible()
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
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Delete City lights' })).toBeVisible()
  }
}

/** See opens the playlist's page. */
export const Seeing: Story = {
  parameters: renderInOwnFrame(80),
  beforeEach: () => {
    usePlaylistsStore.setState({ playlists: [cityLights], loadStatus: 'loaded' })
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'See City lights' }))

    await expect(usePlaylistsStore.getState().shownPlaylist).toBe(cityLights.fileName)
  }
}

/** Delete asks first: the row only starts it. */
export const Deleting: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Delete City lights' }))

    await expect(args.onDelete).toHaveBeenCalledOnce()
  }
}
