import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { useNavigationStore } from '../navigationStore'
import { CategoryList } from './CategoryList'

const meta = {
  component: CategoryList,
  // As wide as the side menu's content.
  decorators: [
    Story => (
      <div className="w-60">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof CategoryList>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Every category, each with its icon: Songs, then Settings. The current one, Songs at launch, is
 * highlighted and announced as the current page.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Songs' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    await expect(canvas.getByRole('button', { name: 'Settings' })).not.toHaveAttribute(
      'aria-current'
    )
  }
}

/** On the Settings view, Settings is the highlighted, current page. */
export const OnSettings: Story = {
  parameters: renderInOwnFrame(140),
  beforeEach: () => {
    useNavigationStore.setState({ currentCategory: 'settings' })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    await expect(canvas.getByRole('button', { name: 'Songs' })).not.toHaveAttribute('aria-current')
  }
}
