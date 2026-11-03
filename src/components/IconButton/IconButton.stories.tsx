import {
  ArrowPathIcon,
  ArrowsRightLeftIcon,
  Bars3Icon,
  ForwardIcon,
  PlayIcon
} from '@heroicons/react/20/solid'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { IconButton } from './IconButton'

const meta = {
  component: IconButton,
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

/**
 * An `outlined` square, the button of the app's left column, which opens and closes the side menu.
 */
export const Square: Story = {
  args: { icon: Bars3Icon, label: 'Open menu', shape: 'square', variant: 'outlined' }
}

/**
 * A `filled` disc, larger than a circle, for the main action of a group, like play and pause in the
 * audio player.
 */
export const Disc: Story = {
  args: { icon: PlayIcon, label: 'Play', shape: 'disc', variant: 'filled' }
}

/** The icon spins while the action runs, like a library scan in progress. */
export const Busy: Story = {
  args: { isBusy: true }
}

/**
 * A toggle that is on, like shuffle: a `pen` icon on a pen-tinted circle, which screen readers
 * hear as pressed.
 */
export const Pressed: Story = {
  args: { icon: ArrowsRightLeftIcon, label: 'Shuffle', isPressed: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Shuffle' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  }
}

/**
 * An action that can't run right now, like "Next song" on the last song without repeat: the
 * button fades, and clicking it does nothing.
 */
export const Disabled: Story = {
  args: { icon: ForwardIcon, label: 'Next song', isDisabled: true },
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Next song' })
    await expect(button).toBeDisabled()

    await userEvent.click(button)
    await expect(args.onClick).not.toHaveBeenCalled()
  }
}
