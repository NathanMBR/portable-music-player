import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, fn, within } from 'storybook/test'
import { Slider } from './Slider'

const meta = {
  component: Slider,
  args: {
    label: 'Volume',
    value: 40,
    max: 100,
    valueText: '40%',
    onChange: fn(),
    onCommit: fn()
  },
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

/** Near the start, like a song's first seconds: the pen still reaches the thumb, with no gap. */
export const NearTheStart: Story = {
  args: { value: 5, valueText: '5%' }
}

/** Near the end, like a song's last seconds: the pen stops at the thumb instead of running past. */
export const NearTheEnd: Story = {
  args: { value: 95, valueText: '95%' }
}

/**
 * With a `step`, the thumb stops on the step nearest the value, and the pen ends under it, like the
 * song's position, which moves in tenths of a second.
 */
export const StopsOnItsStep: Story = {
  args: { label: 'Song position', value: 12.34, max: 30, step: 0.1, valueText: '00:12 of 00:30' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('slider', { name: 'Song position' })).toHaveValue('12.3')
  }
}

/**
 * A slider that can't move right now fades and ignores input, like the song's position while its
 * length is still unknown.
 */
export const Disabled: Story = {
  args: { value: 0, valueText: 'Length unknown', isDisabled: true },
  play: async ({ canvas }) => {
    const slider = canvas.getByRole('slider', { name: 'Volume' })
    await expect(slider).toBeDisabled()
    await expect(getComputedStyle(slider).cursor).toBe('not-allowed')
  }
}

/** The pointer over the slider turns into the hand buttons show, since a click there moves it. */
export const ShowsTheButtonsCursor: Story = {
  play: async ({ canvas }) => {
    await expect(getComputedStyle(canvas.getByRole('slider', { name: 'Volume' })).cursor).toBe(
      'pointer'
    )
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

/** With a `wheelStep`, the mouse wheel over the slider moves it: up raises it, down lowers it. */
export const MovesWithTheWheel: Story = {
  args: { wheelStep: 5 },
  play: async ({ args, canvas }) => {
    const slider = canvas.getByRole('slider', { name: 'Volume' })

    fireEvent.wheel(slider, { deltaY: -100 })
    await expect(args.onChange).toHaveBeenLastCalledWith(45)

    fireEvent.wheel(slider, { deltaY: 100 })
    await expect(args.onChange).toHaveBeenLastCalledWith(35)
  }
}

/** The wheel stops the slider at its ends instead of carrying it past them. */
export const StopsAtTheEndsWithTheWheel: Story = {
  args: { value: 98, valueText: '98%', wheelStep: 5 },
  play: async ({ args, canvas }) => {
    fireEvent.wheel(canvas.getByRole('slider', { name: 'Volume' }), { deltaY: -100 })

    await expect(args.onChange).toHaveBeenCalledWith(100)
  }
}

/**
 * With an `arrowKeyStep`, each arrow key moves the slider that far: right and up raise it, left
 * and down lower it.
 */
export const MovesWithTheArrowKeys: Story = {
  args: { arrowKeyStep: 5 },
  play: async ({ args, userEvent }) => {
    await userEvent.tab()

    await userEvent.keyboard('{ArrowRight}')
    await expect(args.onChange).toHaveBeenLastCalledWith(45)
    await userEvent.keyboard('{ArrowLeft}')
    await expect(args.onChange).toHaveBeenLastCalledWith(35)
    await userEvent.keyboard('{ArrowUp}')
    await expect(args.onChange).toHaveBeenLastCalledWith(45)
    await userEvent.keyboard('{ArrowDown}')
    await expect(args.onChange).toHaveBeenLastCalledWith(35)
  }
}

/**
 * A drag moves the slider all along (`onChange`), and the move is committed (`onCommit`) only once
 * it's released, which the browser tells with a `change` event, like a click's.
 */
export const CommitsWhenTheMoveEnds: Story = {
  play: async ({ args, canvas }) => {
    const slider = canvas.getByRole('slider', { name: 'Volume' })

    fireEvent.input(slider, { target: { value: '55' } })
    await expect(args.onChange).toHaveBeenLastCalledWith(55)
    await expect(args.onCommit).not.toHaveBeenCalled()

    fireEvent.change(slider, { target: { value: '70' } })
    await expect(args.onCommit).toHaveBeenCalledTimes(1)
    await expect(args.onCommit).toHaveBeenCalledWith(70)
  }
}

/** Every press of an arrow key is a whole move, committed at once. */
export const CommitsEachArrowKeyPress: Story = {
  args: { arrowKeyStep: 5 },
  play: async ({ args, userEvent }) => {
    await userEvent.tab()

    await userEvent.keyboard('{ArrowRight}')
    await expect(args.onCommit).toHaveBeenLastCalledWith(45)
    await userEvent.keyboard('{ArrowRight}')
    await expect(args.onCommit).toHaveBeenCalledTimes(2)
  }
}

/** The arrow keys stop the slider at its ends instead of carrying it past them. */
export const StopsAtTheEndsWithTheArrowKeys: Story = {
  args: { value: 98, valueText: '98%', arrowKeyStep: 5 },
  play: async ({ args, userEvent }) => {
    await userEvent.tab()

    await userEvent.keyboard('{ArrowRight}')

    await expect(args.onChange).toHaveBeenCalledWith(100)
  }
}

/** Without a `wheelStep`, the wheel leaves the slider where it is. */
export const IgnoresTheWheelWithoutAStep: Story = {
  play: async ({ args, canvas }) => {
    fireEvent.wheel(canvas.getByRole('slider', { name: 'Volume' }), { deltaY: -100 })

    await expect(args.onChange).not.toHaveBeenCalled()
  }
}

const percent = (value: number) => `${value}%`

// A point on the track, `x` from the window's left edge, halfway down it.
const pointOn = (track: DOMRect, x: number) => ({
  clientX: x,
  clientY: track.top + track.height / 2
})

const centerX = (rect: DOMRect) => rect.left + rect.width / 2

/**
 * With `formatPointerValue`, a tooltip above the pointer says at once what a click there would
 * set, its arrow on the pointer and clear of the thumb: half a track from its start gives half the
 * maximum, and its end the maximum.
 */
export const TooltipShowsWhereAClickLands: Story = {
  args: { formatPointerValue: percent },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    const slider = canvas.getByRole('slider', { name: 'Volume' })
    const track = slider.getBoundingClientRect()

    await userEvent.pointer({ target: slider, coords: pointOn(track, centerX(track)) })
    const tooltip = page.getByText('50%')
    await expect(tooltip).toBeVisible()
    const arrow = tooltip.parentElement?.querySelector('svg')?.getBoundingClientRect()
    await expect(arrow && centerX(arrow)).toBeCloseTo(centerX(track), 0)
    await expect(arrow?.bottom).toBeLessThan(track.top)

    await userEvent.pointer({ target: slider, coords: pointOn(track, track.right - 1) })
    await expect(page.getByText('100%')).toBeVisible()
  }
}

/** The tooltip goes as soon as the pointer leaves the slider. */
export const TooltipHidesWhenThePointerLeaves: Story = {
  args: { formatPointerValue: percent },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    const slider = canvas.getByRole('slider', { name: 'Volume' })
    const track = slider.getBoundingClientRect()
    await userEvent.pointer({ target: slider, coords: pointOn(track, centerX(track)) })
    await expect(page.getByText('50%')).toBeVisible()

    await userEvent.unhover(slider)

    await expect(page.queryByText('50%')).not.toBeInTheDocument()
  }
}

/** A disabled slider shows no tooltip, since a click there does nothing. */
export const NoTooltipWhileDisabled: Story = {
  args: { formatPointerValue: percent, isDisabled: true },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    const slider = canvas.getByRole('slider', { name: 'Volume' })
    const track = slider.getBoundingClientRect()

    await userEvent.pointer({ target: slider, coords: pointOn(track, centerX(track)) })

    await expect(page.queryByText('50%')).not.toBeInTheDocument()
  }
}

/** A finger has no hover, so a touch shows no tooltip, even while it slides along the track. */
export const NoTooltipForTouch: Story = {
  args: { formatPointerValue: percent },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    const slider = canvas.getByRole('slider', { name: 'Volume' })
    const track = slider.getBoundingClientRect()

    await userEvent.pointer([
      { keys: '[TouchA>]', target: slider, coords: pointOn(track, track.left + 1) },
      { pointerName: 'TouchA', target: slider, coords: pointOn(track, centerX(track)) }
    ])

    await expect(page.queryByText('50%')).not.toBeInTheDocument()
  }
}
