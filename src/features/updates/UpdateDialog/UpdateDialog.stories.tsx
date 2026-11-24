import type { Meta, StoryObj } from '@storybook/react-vite'
import type { InvokeArgs } from '@tauri-apps/api/core'
import { expect, fn, waitFor, within } from 'storybook/test'
import { loggedMessages } from '../../../testing/logs'
import { failingCommand, mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { withNotificationArea } from '../../../testing/withNotificationArea'
import type { FoundUpdate } from '../types'
import { useUpdateStore } from '../updateStore'
import { UpdateDialog } from './UpdateDialog'

const DIALOG = { name: 'Update found!' }
const SKIP_BUTTON = { name: 'Skip update' }
const DOWNLOAD_BUTTON = { name: 'Download update' }

const NEW_VERSION: FoundUpdate = {
  version: '0.2.0',
  notes: `## New features

- Checks for updates each time the app opens
- Checks for updates by hand from the Settings page

## Bug fixes

- The progress bar no longer freezes while a song plays`
}

const DOWNLOAD_ERROR =
  "Couldn't install the update: Could not fetch a valid release JSON from the remote"

const saveSettings = fn((_args?: InvokeArgs) => undefined)

// Answers the download a story started, to see the dialog while it runs.
let finishDownload: () => void = () => undefined

const meta = {
  component: UpdateDialog,
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(460) },
  decorators: [withNotificationArea],
  beforeEach: () => {
    saveSettings.mockClear()
    mockCommands({ save_settings: saveSettings, install_update: () => undefined })
    useUpdateStore.setState({ foundUpdate: NEW_VERSION, isDialogOpen: true })
  }
} satisfies Meta<typeof UpdateDialog>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Opened from the side menu's Update option, it shows the new version's patch notes in a box that
 * scrolls, and offers to skip the update or download it.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const dialog = await page.findByRole('dialog', DIALOG)
    await expect(dialog).toHaveAccessibleDescription(
      'A new version is available. Check the changes below:'
    )
    const notes = within(page.getByRole('region', { name: 'Changes in version 0.2.0' }))
    await expect(notes.getByRole('heading', { name: 'New features' })).toBeVisible()
    await expect(notes.getAllByRole('listitem')).toHaveLength(3)
    const buttons = within(dialog)
      .getAllByRole('button')
      .map(button => button.textContent)
    await expect(buttons).toEqual(['Skip update', 'Download update'])
  }
}

/**
 * Skip update stops offering it, which takes the side menu's option and the dots away, and saves
 * its version as skipped, so the check at launch passes over it.
 */
export const SkippingTheUpdate: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(await page.findByRole('button', SKIP_BUTTON))

    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
    await expect(useUpdateStore.getState().foundUpdate).toBeNull()
    await expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ skipUpdateVersion: '0.2.0' }) })
    )
    await expect(loggedMessages()).toContain('Skipped update to version 0.2.0')
  }
}

/** Escape closes the dialog and still offers the update from the side menu. */
export const ClosingWithoutChoosing: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await page.findByRole('dialog', DIALOG)

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
    await expect(useUpdateStore.getState().foundUpdate).toEqual(NEW_VERSION)
  }
}

/**
 * While the update downloads, the button says so, neither button can be clicked, and the dialog
 * can't be closed. Then it closes: an installed build closes for the installer, and a portable
 * build's download goes on in the browser.
 */
export const Downloading: Story = {
  beforeEach: () => {
    mockCommands({
      save_settings: saveSettings,
      install_update: () =>
        new Promise<void>(resolve => {
          finishDownload = resolve
        })
    })
  },
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(await page.findByRole('button', DOWNLOAD_BUTTON))

    await expect(await page.findByRole('button', { name: 'Downloading update…' })).toBeDisabled()
    await expect(page.getByRole('button', SKIP_BUTTON)).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    await expect(page.getByRole('dialog', DIALOG)).toBeVisible()

    finishDownload()

    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
  }
}

/** A download that fails keeps the dialog open, to try again, and notifies why. */
export const FailedDownload: Story = {
  beforeEach: () => {
    mockCommands({ save_settings: saveSettings, install_update: failingCommand(DOWNLOAD_ERROR) })
  },
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(await page.findByRole('button', DOWNLOAD_BUTTON))

    await waitFor(() => expect(page.getByText("Couldn't download the update")).toBeVisible())
    await expect(page.getByText(DOWNLOAD_ERROR)).toBeVisible()
    await expect(page.getByRole('button', DOWNLOAD_BUTTON)).toBeEnabled()
    await expect(page.getByRole('dialog', DIALOG)).toBeVisible()
  }
}
