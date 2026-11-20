import { Description } from '@headlessui/react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import { renderInOwnFrame } from '../../testing/storyParameters'
import { Button } from '../Button/Button'
import { Modal, ModalButtons, ModalTitle } from './Modal'

const close = fn()

const meta = {
  component: Modal,
  // Each open dialog covers its whole frame.
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(260) },
  args: {
    isOpen: true,
    onClose: close,
    children: (
      <>
        <ModalTitle>Replace songs with the same name?</ModalTitle>
        <Description className="mt-2 text-sm text-ink-faded">
          2 of the 4 songs have the same file name as songs already in the Songs folder.
        </Description>
        <ModalButtons>
          <Button variant="quiet" onClick={close}>
            Cancel
          </Button>
          <Button onClick={close}>Skip them</Button>
        </ModalButtons>
      </>
    )
  }
} satisfies Meta<typeof Modal>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Open over the dimmed page, named by its title, with its buttons at the bottom right, the main
 * one last.
 */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const dialog = await page.findByRole('dialog', { name: 'Replace songs with the same name?' })
    await expect(dialog).toBeVisible()
  }
}

/** Escape asks the dialog to close, like a click outside it. */
export const ClosesOnEscape: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await page.findByRole('dialog')

    await userEvent.keyboard('{Escape}')

    await expect(close).toHaveBeenCalled()
  }
}

/** A wider panel, for content with lists. */
export const Wide: Story = {
  args: { isWide: true }
}
