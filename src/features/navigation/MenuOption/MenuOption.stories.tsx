import { ArrowDownTrayIcon, Cog6ToothIcon, MusicalNoteIcon } from '@heroicons/react/20/solid'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { MenuOption } from './MenuOption'

const meta = {
  component: MenuOption,
  args: { icon: MusicalNoteIcon, label: 'Songs', onClick: fn() },
  // As wide as the side menu's content.
  decorators: [
    Story => (
      <div className="w-60">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof MenuOption>

export default meta
type Story = StoryObj<typeof meta>

/** An option of the side menu, its icon before its name. Clicking it runs `onClick`. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Songs' }))
    await expect(args.onClick).toHaveBeenCalledOnce()
  }
}

/** The page on screen takes the active look of pressed buttons and is marked as the current page. */
export const Current: Story = {
  args: { icon: Cog6ToothIcon, label: 'Settings', isCurrent: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  }
}

/**
 * An option that leads to something new, like an update found, has a dot on its icon's corner. Its
 * name stays the same.
 */
export const WithNotificationDot: Story = {
  args: { icon: ArrowDownTrayIcon, label: 'Update', hasNotificationDot: true },
  play: async ({ canvas }) => {
    const option = canvas.getByRole('button', { name: 'Update' })
    await expect(option.querySelector('[data-notification-dot]')).toBeVisible()
  }
}
