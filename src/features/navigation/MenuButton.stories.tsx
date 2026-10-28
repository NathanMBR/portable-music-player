import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { MenuButton } from './MenuButton'
import { useNavigationStore } from './navigationStore'

const meta = {
  component: MenuButton,
  tags: ['ai-generated']
} satisfies Meta<typeof MenuButton>

export default meta
type Story = StoryObj<typeof meta>

/** Clicking it opens the side menu, which the app shell renders on top of the page. */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open menu' }))
    await expect(useNavigationStore.getState().isMenuOpen).toBe(true)
  }
}
