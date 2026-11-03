import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, fn } from 'storybook/test'
import { Slider } from './Slider'

const meta = {
  component: Slider,
  args: { label: 'Volume', value: 40, max: 100, valueText: '40%', onChange: fn() },
  // Sliders fill their container, which sets their width.
  decorators: [
    Story => (
      <div className="w-48 p-2">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof Slider>

export default meta
type Story = StoryObj<typeof meta>

/** Partway along: the track is pen up to the thumb and rule after it. */
export const Default: Story = {}

/**
 * A slider that can't move right now fades and ignores input, like the song's position while its
 * length is still unknown.
 */
export const Disabled: Story = {
  args: { value: 0, valueText: 'Length unknown', isDisabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('slider', { name: 'Volume' })).toBeDisabled()
  }
}

/** Moving the slider runs `onChange` with the new value, as a number. */
export const ChangesTheValue: Story = {
  play: async ({ args, canvas }) => {
    fireEvent.change(canvas.getByRole('slider', { name: 'Volume' }), { target: { value: '70' } })

    await expect(args.onChange).toHaveBeenCalledWith(70)
  }
}

/** Clicking the slider moves it without a focus ring, which only keyboard users need. */
export const ClickedWithoutFocusRing: Story = {
  play: async ({ canvas, userEvent }) => {
    const slider = canvas.getByRole('slider', { name: 'Volume' })

    await userEvent.click(slider)

    await expect(slider).toHaveFocus()
    await expect(getComputedStyle(slider).outlineStyle).toBe('none')
  }
}

/** Reaching the slider with Tab rings it in pen, so keyboard users see where they are. */
export const FocusedFromTheKeyboard: Story = {
  play: async ({ canvas, userEvent }) => {
    const slider = canvas.getByRole('slider', { name: 'Volume' })

    await userEvent.tab()

    await expect(slider).toHaveFocus()
    await expect(getComputedStyle(slider).outlineStyle).toBe('solid')
  }
}
