import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { StatusLine } from './StatusLine'

const meta = {
  component: StatusLine
} satisfies Meta<typeof StatusLine>

export default meta
type Story = StoryObj<typeof meta>

/** A short line about the view, like how many songs the Songs folder holds. */
export const Default: Story = {
  args: { children: '1,024 songs' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('1,024 songs')
  }
}

/**
 * Saying nothing, it takes no room, but stays on the page, so screen readers announce what it
 * says next.
 */
export const Empty: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status').offsetHeight).toBe(0)
  }
}
