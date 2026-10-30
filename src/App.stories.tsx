import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { App } from './App'
import { useLibraryStore } from './features/library/libraryStore'
import type { Track } from './features/library/types'
import { DISMISS_LABEL } from './features/notifications/constants'
import { failingCommand, mockCommands } from './testing/mockCommands'
import { renderInOwnFrame } from './testing/storyParameters'

const TRACKS: Track[] = [
  { path: 'Songs/In Excelsis.mp3', title: 'In Excelsis' },
  { path: 'Songs/Ride Into The Storm.mp3', title: 'Ride Into The Storm' },
  { path: 'Songs/Running Alone.mp3', title: 'Running Alone' },
  { path: 'Songs/Streets of Tomorrow.mp3', title: 'Streets of Tomorrow' },
  { path: 'Songs/Unholy Wars.mp3', title: 'Unholy Wars' }
]

const SAVE_ERROR =
  "Couldn't save the settings at /media/usb/settings.json: Read-only file system (os error 30)"

const meta = {
  component: App,
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(560) },
  beforeEach: () => {
    mockCommands({
      load_music_library: () => TRACKS,
      open_songs_folder: () => undefined,
      save_settings: () => undefined
    })
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: TRACKS } })
  }
} satisfies Meta<typeof App>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The whole window: the menu button's column on the left, the current category's view in the
 * middle, and an empty column on the right that keeps the margins equal.
 */
export const Default: Story = {}

/** The menu button opens the side menu, and choosing a category closes it on that view. */
export const NavigatesFromTheSideMenu: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', { name: 'Open menu' }))
    await userEvent.click(await page.findByRole('button', { name: 'Songs' }))

    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
    await expect(canvas.getByRole('heading', { name: 'Songs' })).toBeVisible()
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
      save_settings: failingCommand(SAVE_ERROR)
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
