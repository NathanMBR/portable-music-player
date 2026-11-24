import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { useUpdateStore } from '../../updates/updateStore'
import { useNavigationStore } from '../navigationStore'
import { MenuButton } from './MenuButton'

const meta = {
  component: MenuButton,
  // Room for the dot past the button's corner.
  decorators: [
    Story => (
      <div className="p-2">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof MenuButton>

export default meta
type Story = StoryObj<typeof meta>

const dotOf = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-notification-dot]')

/** Clicking it opens the side menu, which the app shell renders on top of the page. */
export const Default: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(dotOf(canvasElement)).toBeNull()

    await userEvent.click(canvas.getByRole('button', { name: 'Open menu' }))
    await expect(useNavigationStore.getState().isMenuOpen).toBe(true)
  }
}

/**
 * Once a check finds a newer release, a dot on the button's corner says the menu holds it, until
 * the update is skipped. The button's name stays the same.
 */
export const UpdateFound: Story = {
  parameters: renderInOwnFrame(80),
  beforeEach: () => {
    useUpdateStore.setState({
      foundUpdate: { version: '0.2.0', notes: '## New features\n\n- Checks for updates' }
    })
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('button', { name: 'Open menu' })).toBeVisible()
    await expect(dotOf(canvasElement)).toBeVisible()
  }
}
