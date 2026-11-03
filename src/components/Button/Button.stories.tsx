import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { Button } from './Button'

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
