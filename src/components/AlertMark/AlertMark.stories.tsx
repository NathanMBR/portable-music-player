import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { AlertMark } from './AlertMark'

const meta = {
  component: AlertMark,
  args: { label: 'Some songs are missing' }
} satisfies Meta<typeof AlertMark>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The red alert icon, as it takes a round button's place in a list row. Screen readers hear its label, which
 * also shows when the mouse rests on it.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    const mark = canvas.getByRole('img', { name: 'Some songs are missing' })
    await expect(mark).toHaveAttribute('title', 'Some songs are missing')
  }
}

/** Larger, as it takes the large play button's place in a page's header. */
export const Large: Story = {
  args: { isLarge: true }
}
