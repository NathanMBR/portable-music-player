import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, waitFor, within } from 'storybook/test'
import { loggedMessages } from '../../../testing/logs'
import { failingCommand, mockCommands } from '../../../testing/mockCommands'
import { withNotificationArea } from '../../../testing/withNotificationArea'
import { PatchNotes } from './PatchNotes'

const RELEASE_URL = 'https://github.com/NathanMBR/portable-music-player/releases/tag/v0.2.0'

const NOTES = `## New features

- Checks for updates each time the app opens
- Says why a disabled button can't act

## Bug fixes

- The progress bar no longer freezes while a song plays`

const openUrl = fn()

const meta = {
  component: PatchNotes,
  args: { notes: NOTES },
  // As wide as the update dialog's box.
  decorators: [
    Story => (
      <div className="w-96 text-sm text-ink">
        <Story />
      </div>
    )
  ],
  beforeEach: () => {
    openUrl.mockClear()
    mockCommands({ 'plugin:opener|open_url': openUrl })
  }
} satisfies Meta<typeof PatchNotes>

export default meta
type Story = StoryObj<typeof meta>

/** A release's notes, in Markdown: each group of changes under its heading, as a list. */
export const Default: Story = {
  play: async ({ canvas }) => {
    const headings = canvas.getAllByRole('heading', { level: 3 }).map(item => item.textContent)
    await expect(headings).toEqual(['New features', 'Bug fixes'])
    await expect(canvas.getAllByRole('listitem')).toHaveLength(3)
  }
}

/** A link opens in the default browser, so the app's window never leaves the player. */
export const Link: Story = {
  args: { notes: `See [the release on GitHub](${RELEASE_URL}).` },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('link', { name: 'the release on GitHub' }))

    await waitFor(() => expect(openUrl).toHaveBeenCalledWith({ url: RELEASE_URL }))
    await expect(loggedMessages()).toEqual([`Opened link "${RELEASE_URL}"`])
  }
}

/** A link the browser can't open notifies why. */
export const LinkFailure: Story = {
  args: { notes: `See [the release on GitHub](${RELEASE_URL}).` },
  decorators: [withNotificationArea],
  beforeEach: () => {
    mockCommands({ 'plugin:opener|open_url': failingCommand('No browser was found') })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('link', { name: 'the release on GitHub' }))

    await waitFor(() => expect(page.getByText("Couldn't open the link")).toBeVisible())
    await expect(page.getByText('No browser was found')).toBeVisible()
  }
}

/** Images and HTML in the notes are left out: the app loads nothing from the web. */
export const NoImagesOrHtml: Story = {
  args: {
    notes:
      '- Plays songs <b>offline</b>\n- ![Screenshot](https://github.com/NathanMBR/portable-music-player/screenshot.png)'
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument()
    await expect(canvasElement.querySelector('b')).toBeNull()
    await expect(canvas.getAllByRole('listitem')[0]).toHaveTextContent('Plays songs offline')
  }
}

/** A release published without notes says so. */
export const NoNotes: Story = {
  args: { notes: '' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No changes were listed for this version.')).toBeVisible()
  }
}
