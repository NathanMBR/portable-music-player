import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, waitFor, within } from 'storybook/test'
import { loggedMessages } from '../../../testing/logs'
import { mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { connectButtonLog } from '../../logging/buttonLog'
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

/** Where a real click at the middle of the element lands, whatever covers it. */
const elementAtTheMiddleOf = (element: Element) => {
  const box = element.getBoundingClientRect()
  const landing = element.ownerDocument.elementFromPoint(
    box.left + box.width / 2,
    box.top + box.height / 2
  )
  if (!landing) {
    throw new Error('Nothing is under the middle of the element')
  }
  return landing
}

/** Where a real click on the row's left padding, before its first control, lands. */
const elementAtTheRowStart = (row: Element) => {
  const box = row.getBoundingClientRect()
  const landing = row.ownerDocument.elementFromPoint(box.left + 2, box.top + box.height / 2)
  if (!landing) {
    throw new Error('Nothing is under the start of the row')
  }
  return landing
}

const meta = {
  component: PlaylistRow,
  args: { playlist: cityLights, onEdit: fn(), onDelete: fn() },
  parameters: renderInOwnFrame(240),
  // Rows are list items, so they need a list around them.
  decorators: [
    Story => (
      <ul>
        <Story />
      </ul>
    )
  ],
  beforeEach: () => {
    usePlaylistsStore.setState({ playlists: [cityLights], loadStatus: 'loaded' })
  }
} satisfies Meta<typeof PlaylistRow>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Its play button, the square of the Playlists icon, the title and description, then the menu of
 * what can be done to it at the right end. The whole row is a button that opens the playlist, and
 * hovering it shows the name whole.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Play City lights' })).toBeEnabled()
    await expect(canvas.getByRole('button', { name: 'See City lights' })).toHaveAttribute(
      'title',
      'City lights · Late trains and empty streets'
    )
    await expect(canvas.getByRole('button', { name: 'More for City lights' })).toBeVisible()
  }
}

/** A playlist without a description shows its title alone. */
export const WithoutDescription: Story = {
  args: { playlist: { ...cityLights, description: '' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'See City lights' })).toHaveAttribute(
      'title',
      'City lights'
    )
    await expect(canvas.getByRole('listitem')).toHaveTextContent(/^City lights$/)
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
    await expect(canvas.getByRole('button', { name: 'More for City lights' })).toBeVisible()
  }
}

/** A click anywhere on the row outside its buttons, like on its description, opens the playlist. */
export const OpeningFromTheRow: Story = {
  beforeEach: () => connectButtonLog(),
  play: async ({ canvas, userEvent }) => {
    const landing = elementAtTheMiddleOf(canvas.getByText(/Late trains and empty streets/))
    await expect(landing).toBe(canvas.getByRole('button', { name: 'See City lights' }))

    await userEvent.click(landing)

    await expect(usePlaylistsStore.getState().shownPlaylist).toBe(cityLights.fileName)
    await expect(loggedMessages()).toEqual([
      'Clicked at button "See City lights"',
      'Opened playlist "City lights"'
    ])
  }
}

/**
 * The keyboard reaches the row in its place, after its play button, as its title, with its focus
 * ring around the whole row, and Enter opens the playlist.
 */
export const OpeningFromTheKeyboard: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const opening = canvas.getByRole('button', { name: 'See City lights' })
    await userEvent.tab()
    await expect(canvas.getByRole('button', { name: 'Play City lights' })).toHaveFocus()
    await userEvent.tab()
    await expect(opening).toHaveFocus()
    // The ring is drawn by the part of the button stretched over the row.
    const ring = canvasElement.ownerDocument.defaultView?.getComputedStyle(opening, '::after')
    await expect(ring?.outlineStyle).toBe('solid')
    await expect(ring?.position).toBe('absolute')

    await userEvent.keyboard('{Enter}')

    await expect(usePlaylistsStore.getState().shownPlaylist).toBe(cityLights.fileName)
  }
}

/** The pointer shows the row is clickable all over, up to its very edge. */
export const ClickableAllOver: Story = {
  play: async ({ canvas, canvasElement }) => {
    const row = canvas.getByRole('listitem')
    const view = canvasElement.ownerDocument.defaultView
    const cursorAt = (element: Element) => view?.getComputedStyle(element).cursor

    await expect(cursorAt(elementAtTheRowStart(row))).toBe('pointer')
    await expect(cursorAt(elementAtTheMiddleOf(canvas.getByText('City lights')))).toBe('pointer')
  }
}

/** Its own buttons sit above the row: each does its own job and never opens the playlist. */
export const ButtonsAboveTheRow: Story = {
  args: { playlist: { ...cityLights, allSongsFound: false } },
  beforeEach: () => {
    usePlaylistsStore.setState({ playlists: [{ ...cityLights, allSongsFound: false }] })
    mockCommands({
      check_playlist: () => ({ playlist: { ...cityLights, allSongsFound: false }, missingCount: 1 })
    })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    for (const name of ['Play City lights', 'Recheck City lights', 'More for City lights']) {
      const button = canvas.getByRole('button', { name })
      await expect(elementAtTheMiddleOf(button).closest('button')).toBe(button)
    }

    await userEvent.click(canvas.getByRole('button', { name: 'Recheck City lights' }))
    await userEvent.click(canvas.getByRole('button', { name: 'More for City lights' }))

    await expect(await within(canvasElement.ownerDocument.body).findByRole('menu')).toBeVisible()
    await expect(usePlaylistsStore.getState().shownPlaylist).toBeNull()
  }
}

/** Its menu holds Edit playlist, then Delete playlist, each handing the playlist on. */
export const Menu: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'More for City lights' }))

    const items = await page.findAllByRole('menuitem')
    await expect(items.map(item => item.textContent)).toEqual(['Edit playlist', 'Delete playlist'])

    await userEvent.click(page.getByRole('menuitem', { name: 'Edit playlist' }))
    await expect(args.onEdit).toHaveBeenCalledOnce()

    await userEvent.click(canvas.getByRole('button', { name: 'More for City lights' }))
    await userEvent.click(await page.findByRole('menuitem', { name: 'Delete playlist' }))
    await waitFor(() => expect(args.onDelete).toHaveBeenCalledOnce())
    await expect(usePlaylistsStore.getState().shownPlaylist).toBeNull()
  }
}
