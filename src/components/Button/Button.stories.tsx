import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import { untilBrowserPointerSettles } from '../../testing/browserPointer'
import { Button } from './Button'

const REASON = 'Disabled while automatic update checks are on'

// The reason is also in the page as the button's description, hidden, apart from the tooltip.
const TOOLTIP_TEXT = { ignore: '[hidden]' }

// A disabled button lets the pointer through to what wraps it, which shows the tooltip.
const hoverAreaOf = (button: HTMLElement) => button.parentElement as HTMLElement

const meta = {
  component: Button,
  args: { children: 'Try again', onClick: fn() }
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The `filled` look, for the main action of a notice, like retrying a failed scan. Clicking it runs
 * `onClick`.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }))
    await expect(args.onClick).toHaveBeenCalledOnce()
  }
}

/** A `quiet` text button, for a secondary action next to a filled one. */
export const Quiet: Story = {
  args: { children: 'Dismiss', variant: 'quiet' }
}

/** An `outlined` text button, for a secondary action that should still read as a button. */
export const Outlined: Story = {
  args: { children: 'Open folder', variant: 'outlined' }
}

/** An action that can't run yet, like Save before a new playlist has a title: faded, ignoring clicks. */
export const Disabled: Story = {
  args: { children: 'Save', isDisabled: true },
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Save' })
    await expect(button).toBeDisabled()

    await userEvent.click(button)

    await expect(args.onClick).not.toHaveBeenCalled()
  }
}

/**
 * A disabled button that says why, like Check for updates while automatic update checks are on: a
 * tooltip above it while the pointer is over it, and its description for screen readers.
 */
export const DisabledWithReason: Story = {
  args: {
    children: 'Check for updates',
    variant: 'outlined',
    isDisabled: true,
    disabledReason: REASON
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    const button = canvas.getByRole('button', { name: 'Check for updates' })
    await expect(button).toHaveAccessibleDescription(REASON)
    await untilBrowserPointerSettles()

    await userEvent.hover(hoverAreaOf(button))

    const tooltip = page.getByText(REASON, TOOLTIP_TEXT)
    await expect(tooltip).toBeVisible()
    await expect(tooltip.getBoundingClientRect().bottom).toBeLessThan(
      button.getBoundingClientRect().top
    )

    await userEvent.unhover(hoverAreaOf(button))

    await expect(page.queryByText(REASON, TOOLTIP_TEXT)).not.toBeInTheDocument()
  }
}

/** A button that can act keeps its reason to itself: no tooltip, no description. */
export const NoReasonWhileEnabled: Story = {
  args: { children: 'Check for updates', variant: 'outlined', disabledReason: REASON },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    const button = canvas.getByRole('button', { name: 'Check for updates' })
    await expect(button).not.toHaveAccessibleDescription()

    await userEvent.hover(button)

    await expect(page.queryByText(REASON)).not.toBeInTheDocument()
  }
}

/** Proves the app's Tailwind theme loaded in Storybook: the button is filled with `pen`. */
export const CssCheck: Story = {
  tags: ['!autodocs', '!manifest'],
  globals: { theme: 'light' },
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Try again' })
    // bg-pen is #2c46d1 in the light theme (src/index.css).
    await expect(getComputedStyle(button).backgroundColor).toBe('rgb(44, 70, 209)')
  }
}
