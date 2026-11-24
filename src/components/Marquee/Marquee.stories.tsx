import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useState } from 'react'
import { expect, waitFor } from 'storybook/test'
import { Marquee } from './Marquee'

/** A marquee held still until the Slide button is pressed, as the player holds a paused song's. */
const SlidingOnDemand = ({ children }: { children: ReactNode }) => {
  const [isSliding, setIsSliding] = useState(false)

  return (
    <>
      <button type="button" aria-pressed={isSliding} onClick={() => setIsSliding(!isSliding)}>
        Slide
      </button>
      <Marquee isSliding={isSliding}>{children}</Marquee>
    </>
  )
}

const meta = {
  component: Marquee,
  decorators: [
    Story => (
      <div className="w-80">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof Marquee>

export default meta
type Story = StoryObj<typeof meta>

// While it slides, a copy of the text follows it, hidden from screen readers: queries skip it.
const COPY_SELECTOR = '[aria-hidden="true"]'
const SKIPPING_THE_COPY = { ignore: `${COPY_SELECTOR} *` }

const ONE_SECOND_MS = 1000

const durationOf = (slide: Animation) => Number(slide.effect?.getComputedTiming().duration)

/** The marquee's frame, around the text and what moves it. */
const frameOf = (text: HTMLElement) => {
  const frame = text.parentElement?.parentElement?.parentElement
  if (!frame) {
    throw new Error('The text is not in a marquee')
  }
  return frame
}

const slidesIn = (frame: HTMLElement) => frame.getAnimations({ subtree: true })

const findSlide = (frame: HTMLElement) => {
  const [slide] = slidesIn(frame)
  if (!slide || !(durationOf(slide) > 0)) {
    throw new Error('The text is not sliding in a marquee')
  }
  return slide
}

// Two frames, so the resize observer has seen whatever the last layout changed.
const twoFrames = () =>
  new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

/**
 * The marquee holding `text`, its slide, paused so a test can move it, and where the text and its
 * copy show at a given moment of the slide. The slide starts once the marquee is measured, after
 * it renders, and starts again once the font loads and changes the text's width.
 */
const marqueeHolding = async (text: HTMLElement) => {
  const frame = frameOf(text)
  await document.fonts.ready
  await twoFrames()
  const slide = await waitFor(() => findSlide(frame))
  slide.pause()
  const copy = frame.querySelector(COPY_SELECTOR)
  if (!copy) {
    throw new Error('No copy follows the text')
  }
  const boxesAt = (milliseconds: number) => {
    slide.currentTime = milliseconds
    return { text: text.getBoundingClientRect(), copy: copy.getBoundingClientRect() }
  }
  return { frame, slide, duration: durationOf(slide), boxesAt }
}

/** How far the text slides in a second. */
const pixelsPerSecond = (boxesAt: (milliseconds: number) => { text: DOMRect }) =>
  boxesAt(0).text.left - boxesAt(ONE_SECOND_MS).text.left

/**
 * Its text slides from right to left without end. One second after it starts going off past the
 * left edge, it comes in again from past the right edge, so a copy of it, hidden from screen
 * readers, shows the text leaving while the text comes in.
 */
export const Default: Story = {
  args: { children: <span>Thorn Within · Metallica</span> },
  play: async ({ canvas }) => {
    const text = canvas.getByText('Thorn Within · Metallica', SKIPPING_THE_COPY)
    const { frame, slide, boxesAt } = await marqueeHolding(text)
    const frameBox = frame.getBoundingClientRect()
    const speed = pixelsPerSecond(boxesAt)
    const { text: entering, copy: leaving } = boxesAt(0)

    await expect(entering.left).toBeCloseTo(frameBox.right, 0)
    await expect(leaving.left).toBeCloseTo(frameBox.left - speed, 0)
    await expect(frame.querySelector(COPY_SELECTOR)).toHaveTextContent('Thorn Within · Metallica')
    await expect(slide.effect?.getComputedTiming().iterations).toBe(Number.POSITIVE_INFINITY)
  }
}

/**
 * A text longer than the marquee can't come in again before it has all come in, so it comes in
 * again one second after its end has.
 */
export const LongerThanItsSpace: Story = {
  args: {
    children: (
      <span>The Frayed Ends of Sanity · Metallica · The Frayed Ends of Sanity · Metallica</span>
    )
  },
  play: async ({ canvas }) => {
    const text = canvas.getByText(/^The Frayed Ends of Sanity/, SKIPPING_THE_COPY)
    const { frame, boxesAt } = await marqueeHolding(text)
    const frameBox = frame.getBoundingClientRect()
    await expect(text.getBoundingClientRect().width).toBeGreaterThan(frameBox.width)
    const speed = pixelsPerSecond(boxesAt)
    const { text: entering, copy: leaving } = boxesAt(0)

    await expect(entering.left).toBeCloseTo(frameBox.right, 0)
    await expect(leaving.right).toBeCloseTo(frameBox.right - speed, 0)
  }
}

/** Still, its text sits in the middle, like a plain line, and doesn't slide or show a copy. */
export const Still: Story = {
  args: { children: <span>Thorn Within · Metallica</span>, isSliding: false },
  play: async ({ canvas }) => {
    const text = canvas.getByText('Thorn Within · Metallica')
    const frame = frameOf(text)
    const frameBox = frame.getBoundingClientRect()
    const textBox = text.getBoundingClientRect()

    await expect(slidesIn(frame)).toEqual([])
    await expect(frame.querySelector(COPY_SELECTOR)).toBeNull()
    await expect(textBox.left - frameBox.left).toBeCloseTo(frameBox.right - textBox.right, 0)
  }
}

/** Still, a text longer than its space is cut with an ellipsis. */
export const StillAndTooLong: Story = {
  args: {
    children: 'The Frayed Ends of Sanity · Metallica · The Frayed Ends of Sanity · Metallica',
    isSliding: false
  },
  play: async ({ canvas }) => {
    const track = canvas.getByText(/^The Frayed Ends of Sanity/)

    await expect(getComputedStyle(track).textOverflow).toBe('ellipsis')
    await expect(track.scrollWidth).toBeGreaterThan(track.clientWidth)
  }
}

/** A short text and a long one slide at the same speed. */
export const SameSpeedWhateverTheLength: Story = {
  args: { children: <span>Thorn Within</span> },
  render: () => (
    <>
      <Marquee>
        <span>Thorn Within</span>
      </Marquee>
      <Marquee>
        <span>The Frayed Ends of Sanity · Metallica</span>
      </Marquee>
    </>
  ),
  play: async ({ canvas }) => {
    const short = await marqueeHolding(canvas.getByText('Thorn Within', SKIPPING_THE_COPY))
    const long = await marqueeHolding(
      canvas.getByText('The Frayed Ends of Sanity · Metallica', SKIPPING_THE_COPY)
    )

    await expect(pixelsPerSecond(long.boxesAt)).toBeCloseTo(pixelsPerSecond(short.boxesAt))
  }
}

/**
 * A still text that starts sliding sets off from where it stands, in the middle, instead of
 * coming in from the right; held still again, it goes back to the middle.
 */
export const StartsWhereItStands: Story = {
  args: { children: <span>Born to Be · Shaman</span> },
  render: ({ children }) => <SlidingOnDemand>{children}</SlidingOnDemand>,
  play: async ({ canvas, userEvent }) => {
    const text = canvas.getByText('Born to Be · Shaman')
    const leftOfText = () => text.getBoundingClientRect().left
    const stillLeft = leftOfText()

    await userEvent.click(canvas.getByRole('button', { name: 'Slide' }))
    const { frame, slide } = await marqueeHolding(text)

    // It has had a few frames to move, at most a few pixels, and only to the left.
    await expect(leftOfText()).toBeLessThanOrEqual(stillLeft + 0.5)
    await expect(leftOfText()).toBeCloseTo(stillLeft, -1)

    slide.play()
    await userEvent.click(canvas.getByRole('button', { name: 'Slide' }))

    await expect(slidesIn(frame)).toEqual([])
    await expect(leftOfText()).toBeCloseTo(stillLeft)
  }
}

/** Sliding or still, the marquee is one line high, so starting or stopping moves nothing around it. */
export const KeepsItsHeight: Story = {
  args: { children: <span>Jet Pilot · System of a Down</span> },
  render: ({ children }) => <SlidingOnDemand>{children}</SlidingOnDemand>,
  play: async ({ canvas, userEvent }) => {
    const text = canvas.getByText('Jet Pilot · System of a Down')
    const frame = frameOf(text)
    const lineHeight = Number.parseFloat(getComputedStyle(frame).lineHeight)

    await expect(frame.getBoundingClientRect().height).toBe(lineHeight)

    await userEvent.click(canvas.getByRole('button', { name: 'Slide' }))
    await marqueeHolding(text)

    await expect(frame.getBoundingClientRect().height).toBe(lineHeight)
  }
}

/**
 * When its width changes mid-slide, as when the window is resized, the text slides on from where
 * it shows, instead of jumping to where the new width would have put it.
 */
export const SlidesOnWhenItsWidthChanges: Story = {
  args: { children: <span>Battery · Metallica</span> },
  play: async ({ canvas }) => {
    const text = canvas.getByText('Battery · Metallica', SKIPPING_THE_COPY)
    const { frame, slide, duration } = await marqueeHolding(text)
    slide.currentTime = duration / 3
    const shownLeft = text.getBoundingClientRect().left

    frame.style.width = '240px'
    const resumed = await waitFor(() => {
      const next = findSlide(frame)
      if (next === slide) {
        throw new Error('The slide went on unchanged')
      }
      return next
    })
    resumed.pause()

    await expect(text.getBoundingClientRect().left).toBeCloseTo(shownLeft, -1)
  }
}
