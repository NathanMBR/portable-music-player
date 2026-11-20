import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import { renderInOwnFrame } from '../../testing/storyParameters'
import { ConfirmDialog } from './ConfirmDialog'

const meta = {
  component: ConfirmDialog,
  // Each open dialog covers its whole frame.
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(240) },
  args: {
    isOpen: true,
    question: 'Delete "Road trip"?',
    details: 'Its songs stay in the Songs folder.',
    confirmLabel: 'Delete',
    onConfirm: fn(),
    onCancel: fn()
  }
} satisfies Meta<typeof ConfirmDialog>

export default meta
type Story = StoryObj<typeof meta>

/** Asking before a playlist is deleted: the question names the dialog. */
export const Asking: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const dialog = await page.findByRole('dialog', { name: 'Delete "Road trip"?' })
    await expect(within(dialog).getByText('Its songs stay in the Songs folder.')).toBeVisible()
  }
}

/** The button named after the action does it. */
export const Confirming: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(await page.findByRole('button', { name: 'Delete' }))

    await expect(args.onConfirm).toHaveBeenCalledOnce()
    await expect(args.onCancel).not.toHaveBeenCalled()
  }
}

/** Cancel, like Escape or a click outside the dialog, does nothing but close it. */
export const Cancelling: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(await page.findByRole('button', { name: 'Cancel' }))

    await expect(args.onCancel).toHaveBeenCalledOnce()
    await expect(args.onConfirm).not.toHaveBeenCalled()
  }
}
