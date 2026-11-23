import { NumberedListIcon, TrashIcon } from '@heroicons/react/20/solid'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, waitFor, within } from 'storybook/test'
import { connectButtonLog } from '../../features/logging/buttonLog'
import { loggedMessages } from '../../testing/logs'
import { ActionMenu } from './ActionMenu'

const meta = {
  component: ActionMenu,
  args: {
    label: 'More for Gate XIII',
    items: [
      { label: 'Change position', icon: NumberedListIcon, onClick: fn() },
      { label: 'Remove from playlist', icon: TrashIcon, onClick: fn() }
    ]
  },
  parameters: { layout: 'centered' },
  // The app logs every button from main.tsx, so the menu's items are logged as they are there.
  beforeEach: () => connectButtonLog()
} satisfies Meta<typeof ActionMenu>

export default meta
type Story = StoryObj<typeof meta>

/** Closed, the menu is a round button with three vertical dots, named after what it's for. */
export const Closed: Story = {
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'More for Gate XIII' })

    await expect(button).toHaveAttribute('aria-expanded', 'false')
  }
}

/** A click opens its items below it, each with its icon, and the log says it opened. */
export const Open: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'More for Gate XIII' }))

    const menu = await within(canvasElement.ownerDocument.body).findByRole('menu')
    await expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent)
    ).toEqual(['Change position', 'Remove from playlist'])
    await expect(loggedMessages()).toEqual(['Opened menu "More for Gate XIII"'])
  }
}

/** Clicking an item does what it says and closes the menu; the log has the click between. */
export const ChoosingAnItem: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'More for Gate XIII' }))

    await userEvent.click(await page.findByRole('menuitem', { name: 'Change position' }))

    await expect(args.items[0]?.onClick).toHaveBeenCalledOnce()
    await waitFor(() => expect(page.queryByRole('menu')).toBeNull())
    await expect(loggedMessages()).toEqual([
      'Opened menu "More for Gate XIII"',
      'Clicked at button "Change position"',
      'Closed menu "More for Gate XIII"'
    ])
  }
}

/**
 * From the keyboard, Enter opens the menu on its first item, the arrows move through the items,
 * and Enter chooses one, logged like a click.
 */
export const FromTheKeyboard: Story = {
  play: async ({ args, canvas, userEvent }) => {
    canvas.getByRole('button', { name: 'More for Gate XIII' }).focus()

    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')

    await expect(args.items[1]?.onClick).toHaveBeenCalledOnce()
    await expect(args.items[0]?.onClick).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(loggedMessages()).toEqual([
        'Opened menu "More for Gate XIII"',
        'Clicked at button "Remove from playlist"',
        'Closed menu "More for Gate XIII"'
      ])
    )
  }
}

/** Escape closes the menu without choosing, and gives the focus back to its button. */
export const ClosingWithEscape: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    const button = canvas.getByRole('button', { name: 'More for Gate XIII' })
    await userEvent.click(button)
    await page.findByRole('menu')

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(page.queryByRole('menu')).toBeNull())
    await expect(button).toHaveFocus()
    await expect(args.items[0]?.onClick).not.toHaveBeenCalled()
    await expect(loggedMessages()).toEqual([
      'Opened menu "More for Gate XIII"',
      'Closed menu "More for Gate XIII"'
    ])
  }
}
