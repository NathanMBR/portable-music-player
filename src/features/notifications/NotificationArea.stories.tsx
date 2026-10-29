import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { renderInOwnFrame } from '../../testing/storyParameters'
import { DISMISS_LABEL } from './constants'
import { NotificationArea } from './NotificationArea'
import { notify, notifyError } from './notify'

const SAVE_ERROR =
  "Couldn't save the settings at /media/usb/settings.json: Read-only file system (os error 30)"

const meta = {
  component: NotificationArea,
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(320) }
} satisfies Meta<typeof NotificationArea>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Something failed: the title says what, and Rust's message below says why. A notification raised
 * before the area is on screen, like a failure at launch, still shows.
 */
export const Failure: Story = {
  beforeEach: () => {
    notifyError("Couldn't save the theme", SAVE_ERROR)
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    // Notifications fade in, so they're only visible once the animation ends.
    await waitFor(() => expect(page.getByText(SAVE_ERROR)).toBeVisible())
  }
}

/** A message that isn't an error, with the `pen` icon instead of the `correction` one. */
export const Information: Story = {
  beforeEach: () => {
    notify('Library scanned', 'The Songs folder was read again.')
  }
}

/** Several failures stack in the corner. Hovering spreads them out and pauses their timers. */
export const Stacked: Story = {
  beforeEach: () => {
    notifyError(
      "Couldn't load your settings",
      "The settings at /media/usb/settings.json aren't valid: expected value at line 1 column 1"
    )
    notifyError(
      "Couldn't open the Songs folder",
      "Couldn't open the Songs folder: no application can open folders"
    )
    notifyError("Couldn't save the theme", SAVE_ERROR)
  }
}

/** The × button closes a notification before its timer runs out. */
export const DismissedWithTheCloseButton: Story = {
  beforeEach: () => {
    notifyError("Couldn't save the theme", SAVE_ERROR)
  },
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(await page.findByRole('button', { name: DISMISS_LABEL }))

    await waitFor(() => expect(page.queryByText(SAVE_ERROR)).not.toBeInTheDocument())
  }
}
