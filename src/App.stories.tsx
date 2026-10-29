import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { App } from './App'
import { useLibraryStore } from './features/library/libraryStore'
import { SAMPLE_TRACKS } from './features/library/sampleTracks'
import { mockCommands } from './testing/mockCommands'
import { renderInOwnFrame } from './testing/storyParameters'

const meta = {
  component: App,
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(560) },
  beforeEach: () => {
    mockCommands({
      load_music_library: () => SAMPLE_TRACKS,
      open_songs_folder: () => undefined,
      save_settings: () => undefined
    })
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: SAMPLE_TRACKS } })
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
