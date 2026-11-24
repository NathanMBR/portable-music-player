import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { NotificationDot } from './NotificationDot'

// How far the dot's center may sit from the corner it marks, in px.
const CORNER_TOLERANCE_PX = 3

const centerOf = ({ left, top, width, height }: DOMRect) => ({
  x: left + width / 2,
  y: top + height / 2
})

const meta = {
  component: NotificationDot,
  // A control's size, which places the dot, as the menu button does.
  decorators: [
    Story => (
      <div data-testid="control" className="relative size-9 rounded-md border border-rule">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof NotificationDot>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A dot on the top-right corner of a control, saying something waits behind it, like an update
 * behind the menu button. Screen readers skip it: what waits is said where it shows.
 */
export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    const control = canvas.getByTestId('control')
    const dot = control.firstElementChild as HTMLElement
    await expect(dot).toHaveAttribute('aria-hidden', 'true')
    await expect(canvasElement).toHaveTextContent('')

    const controlArea = control.getBoundingClientRect()
    const dotCenter = centerOf(dot.getBoundingClientRect())
    await expect(Math.abs(dotCenter.x - controlArea.right)).toBeLessThan(CORNER_TOLERANCE_PX)
    await expect(Math.abs(dotCenter.y - controlArea.top)).toBeLessThan(CORNER_TOLERANCE_PX)
  }
}
