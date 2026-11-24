import { type ReactNode, useLayoutEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '../usePrefersReducedMotion'

type MarqueeProps = {
  /** What slides through it, on one line. */
  children: ReactNode
  /**
   * Whether the text slides, setting off from where it stands; still, it sits in the middle.
   */
  isSliding?: boolean
}

// Slow enough to read a name as it passes.
const SPEED_PX_PER_SECOND = 40
// How long after the text starts going off past the left edge it comes in again from the right.
const REAPPEARANCE_DELAY_SECONDS = 1
const MILLISECONDS_PER_SECOND = 1000
const REAPPEARANCE_GAP_PX = SPEED_PX_PER_SECOND * REAPPEARANCE_DELAY_SECONDS

// The text keeps one place in the layout, the middle, or the start of a text too long for it, so
// sliding or still it's the same single line: the slide only moves it from there. Still, a text
// too long is cut with an ellipsis.
const TRACK_CLASSES = 'mx-auto block w-max'
const STILL_TRACK_CLASSES = 'max-w-full truncate'

const millisecondsToSlide = (pixels: number) =>
  (pixels / SPEED_PX_PER_SECOND) * MILLISECONDS_PER_SECOND

type Widths = { frameWidth: number; textWidth: number }

/** A running slide, with the widths it was made for. */
type Slide = Widths & { animation: Animation }

type SlidingElements = { mover: HTMLElement; track: HTMLElement; copy: HTMLElement }

const widthsOf = (frame: HTMLElement, track: HTMLElement): Widths => ({
  frameWidth: frame.clientWidth,
  textWidth: track.offsetWidth
})

const isSameWidths = (first: Widths, second: Widths) =>
  first.frameWidth === second.frameWidth && first.textWidth === second.textWidth

/**
 * How far one loop slides the text, the distance between the text and the copy before it: the
 * text comes in from past the right edge one delay after the copy started going off past the
 * left edge, or, when the text is longer than the frame, one delay after the copy's end came in.
 */
const loopLengthOf = ({ frameWidth, textWidth }: Widths) =>
  Math.max(frameWidth, textWidth) + REAPPEARANCE_GAP_PX

/**
 * How far from the frame's left edge the slide shows the text now: each loop slides it from past
 * the frame's right edge by one loop length, so its progress alone tells, wherever the layout has
 * moved the text since.
 */
const shownLeftDuring = (slide: Slide) =>
  slide.frameWidth -
  (slide.animation.effect?.getComputedTiming().progress ?? 0) * loopLengthOf(slide)

/**
 * Slides the text left from `shownLeft`, from the frame's left edge, with its copy one loop length
 * before it, without end. Each loop ends with the copy where the text started, so the next one
 * goes on seamlessly. The keyframes are offsets from the text's place in the layout, and the slide
 * starts at the point of its loop where the text shows at `shownLeft`.
 */
const startSlide = (
  { mover, track, copy }: SlidingElements,
  shownLeft: number,
  widths: Widths
): Slide => {
  const { frameWidth } = widths
  const loopLength = loopLengthOf(widths)
  const layoutLeft = track.offsetLeft
  copy.style.left = `${layoutLeft - loopLength}px`
  const animation = mover.animate(
    [
      { transform: `translateX(${frameWidth - layoutLeft}px)` },
      { transform: `translateX(${frameWidth - loopLength - layoutLeft}px)` }
    ],
    { duration: millisecondsToSlide(loopLength), iterations: Number.POSITIVE_INFINITY }
  )
  animation.currentTime = millisecondsToSlide(Math.max(frameWidth - shownLeft, 0))
  return { animation, ...widths }
}

/**
 * Keeps the text and its copy sliding while `isSliding`, from where the text stood when it
 * started. A change of the frame's or the text's width, as when the window or the text changes,
 * slides it on from where it shows, at the same speed; stopping puts it back in its place.
 */
const useSlide = (isSliding: boolean) => {
  const frameRef = useRef<HTMLSpanElement>(null)
  const moverRef = useRef<HTMLSpanElement>(null)
  const trackRef = useRef<HTMLSpanElement>(null)
  const copyRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const [frame, mover, track, copy] = [frameRef, moverRef, trackRef, copyRef].map(
      ref => ref.current
    )
    if (!isSliding || !frame || !mover || !track || !copy) {
      return
    }
    const elements = { mover, track, copy }
    // Still, the text shows at its place in the layout, measured from the frame.
    let slide = startSlide(elements, track.offsetLeft, widthsOf(frame, track))
    // An observer reports once as it starts, when nothing has changed yet.
    const observer = new ResizeObserver(() => {
      const widths = widthsOf(frame, track)
      if (isSameWidths(widths, slide)) {
        return
      }
      const shownLeft = shownLeftDuring(slide)
      slide.animation.cancel()
      slide = startSlide(elements, shownLeft, widths)
    })
    observer.observe(frame)
    observer.observe(track)
    return () => {
      observer.disconnect()
      slide.animation.cancel()
    }
  }, [isSliding])

  return { frameRef, moverRef, trackRef, copyRef }
}

/**
 * A line whose text slides from right to left without end, like the song's name in the audio
 * player: it sets off from where it stands and slides at a steady speed; one second after it
 * starts going off past the left edge, it comes in again from past the right edge, so a copy,
 * hidden from screen readers, shows it leaving meanwhile. A text longer than the line comes in
 * again one second after its end has. Held still, as the player does while the song is paused, or
 * with reduced motion asked for, it sits in the middle instead, cut with an ellipsis when it's too
 * long. Sliding or still, it's one line high.
 *
 * @summary Line of text sliding from right to left without end
 */
export const Marquee = ({ children, isSliding = true }: MarqueeProps) => {
  const prefersReducedMotion = usePrefersReducedMotion()
  const isMoving = isSliding && !prefersReducedMotion
  const { frameRef, moverRef, trackRef, copyRef } = useSlide(isMoving)

  return (
    <span ref={frameRef} className="block overflow-hidden whitespace-nowrap">
      {/* Relative, so the text's place in the layout is measured from it, and the copy placed. */}
      <span ref={moverRef} className="relative block">
        <span ref={trackRef} className={`${TRACK_CLASSES} ${isMoving ? '' : STILL_TRACK_CLASSES}`}>
          {children}
        </span>
        {isMoving && (
          <span ref={copyRef} aria-hidden="true" className="absolute top-0 block w-max">
            {children}
          </span>
        )}
      </span>
    </span>
  )
}
