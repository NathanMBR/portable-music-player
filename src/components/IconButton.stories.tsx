import { ArrowPathIcon, Bars3Icon } from '@heroicons/react/20/solid'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { IconButton } from './IconButton'

const meta = {
  component: IconButton,
  tags: ['ai-generated'],
  args: { icon: ArrowPathIcon, label: 'Scan again', onClick: fn() },
  argTypes: { icon: { control: false } }
} satisfies Meta<typeof IconButton>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The quiet round button of view headers. Hovering shows its label, which is also what screen
 * readers announce.
 */
export const Circle: Story = {
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Scan again' })
    await expect(button).toHaveAttribute('title', 'Scan again')
  }
}

/** The outlined square button of the app's left column, which opens and closes the side menu. */
export const Square: Story = {
  args: { icon: Bars3Icon, label: 'Open menu', shape: 'square' }
}

/** The icon spins while the action runs, like a library scan in progress. */
export const Busy: Story = {
  args: { isBusy: true }
}
