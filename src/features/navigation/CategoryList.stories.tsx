import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { CategoryList } from './CategoryList'

const meta = {
  component: CategoryList,
  tags: ['ai-generated'],
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

/** The current category is highlighted and announced as the current page. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Songs' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  }
}
