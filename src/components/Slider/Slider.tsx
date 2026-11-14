import { Input } from '@headlessui/react'
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
  type WheelEvent
} from 'react'
import { clamp } from '../../clamp'
import { DISABLED_CLASSES } from '../buttonStyles'
import { type FillEnd, fillEnd } from '../sliderFill'
import { valueAtPointer } from '../sliderPointer'
import { snapToStep } from '../sliderStep'
import { Tooltip } from '../Tooltip/Tooltip'

type SliderProps = {
  /** Accessible name, since the slider shows no text of its own. */
  label: string
  /** Where the thumb sits, from 0 to `max`. */
  value: number
  /** The value at the right end of the track. */
  max: number
  /** The smallest move the slider makes, and what its thumb stops on. Whole units without it. */
  step?: number
  /** What screen readers hear for the value, like "40%" or "01:23 of 04:30". */
  valueText: string
  /** Runs with the new value when the slider is dragged, clicked or moved from the keyboard. */
  onChange: (value: number) => void
  /**
   * Runs with the value a move ends on: once a click or a drag is released, and at every press of
   * a key or turn of the wheel. A drag runs `onChange` all along, but this only at its end.
   */
  onCommit?: (value: number) => void
  /** Fades the slider and ignores input, like the song's position while its length is unknown. */
  isDisabled?: boolean
  /** How far one turn of the mouse wheel over the slider moves it. Without it, the wheel doesn't. */
  wheelStep?: number
  /** How far one press of an arrow key moves it. Without it, an arrow moves it one `step`. */
  arrowKeyStep?: number
  /**
   * What a click under the mouse would set, as the tooltip above the pointer says it, like
   * `01:23.4` or `40%`. Without it, no tooltip shows.
   */
  formatPointerValue?: (value: number) => string
}

// What browsers move a slider by when it doesn't say.
const BROWSER_STEP = 1

// Right and up raise the value, left and down lower it, like the browser's own slider.
const ARROW_KEY_DIRECTIONS: Partial<Record<string, number>> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1
}

// The thumb's size, in px. The CSS draws the thumb from it, through a custom property, so the
// track's fill can end under the thumb's center, and the tooltip finds where a click would put it.
const THUMB_SIZE = 14

// How far above the thumb the tooltip's arrow points.
const TOOLTIP_OFFSET = 2

// A finger has no hover, so only these show the tooltip.
const POINTERS_WITH_HOVER = new Set(['mouse', 'pen'])

// The browser's own slider leaves the end of its track uncovered at the maximum, so the track and
// the thumb are drawn here. The thumb stays inside the track, so at the maximum it covers its end.
// WebKitGTK and WebView2 both style the thumb through -webkit-.
const SLIDER_CLASSES =
  'block h-1.5 w-full appearance-none rounded-full [&::-webkit-slider-thumb]:size-(--slider-thumb-size) [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pen'

// A wider ring than the shared one, so it clears the thumb, which is taller than the track.
const KEYBOARD_FOCUS_CLASSES =
  'data-focus:outline-2 data-focus:outline-offset-4 data-focus:outline-pen'

// Headless UI rings inputs however they get focus, like text fields, but a slider clicked with the
// mouse doesn't need a ring. outline-none also hides the browser's own ring in that case.
const POINTER_FOCUS_CLASSES = 'outline-none'

/** Where the pointer is over the slider, and what a click there would set. */
type PointerValue = { x: number; y: number; value: number }

// The track is pen up to the thumb's center and rule after it.
const trackFill = ({ trackPercent, thumbWidths }: FillEnd) => {
  const end = `calc(${trackPercent}% + var(--slider-thumb-size) * ${thumbWidths})`
  return `linear-gradient(to right, var(--color-pen) ${end}, var(--color-rule) ${end})`
}

/**
 * A slider in the app's look: its track is pen up to the thumb's center and rule after it, with a
 * pen thumb that stays inside the track, so the pen meets the thumb at every value, ends included.
 * It moves in whole units, or in `step`s when given, and its thumb stops on the step nearest the
 * value. Dragging, clicking and the keyboard (arrows, Page Up and Down, Home, End) move it; the
 * arrows move it one step, or `arrowKeyStep` when given. The mouse wheel over it moves it too when
 * given a `wheelStep`. Given `formatPointerValue`, a mouse or pen over it shows at once a tooltip
 * (`Tooltip`) above the thumb, its arrow on the pointer, saying what a click there would set; a
 * touch shows none, and neither does a disabled slider. Reached from the keyboard it shows a focus
 * ring, wider than other controls' so it clears the thumb; clicked with the mouse it doesn't. It
 * fills its container's width, so the parent sets how wide it is.
 *
 * @summary Slider with a drawn track and a keyboard-only focus ring
 */
export const Slider = ({
  label,
  value,
  max,
  step = BROWSER_STEP,
  valueText,
  onChange,
  onCommit,
  isDisabled = false,
  wheelStep,
  arrowKeyStep,
  formatPointerValue
}: SliderProps) => {
  const [isFocusedByPointer, setIsFocusedByPointer] = useState(false)
  const [pointerValue, setPointerValue] = useState<PointerValue | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const shownValue = snapToStep(value, step)

  // React's onChange follows every input event, so the end of a move comes from the browser's own
  // change event, sent once a click or a drag is released.
  useEffect(() => {
    const input = inputRef.current
    if (!input || !onCommit) return

    const commit = () => onCommit(Number(input.value))
    input.addEventListener('change', commit)
    return () => input.removeEventListener('change', commit)
  }, [onCommit])

  const moveBy = (change: number) => {
    if (isDisabled) return
    const movedValue = clamp(value + change, 0, max)
    if (movedValue === value) return
    onChange(movedValue)
    onCommit?.(movedValue)
  }

  // Wheeling up raises the value, like turning a knob. A turn that only scrolls sideways is no move.
  const moveWithWheel = (event: WheelEvent<HTMLInputElement>) => {
    if (!wheelStep || event.deltaY === 0) return
    moveBy(event.deltaY < 0 ? wheelStep : -wheelStep)
  }

  // The tooltip's arrow points at the pointer, just above the thumb, which is taller than the track.
  const followPointer = (event: PointerEvent<HTMLInputElement>) => {
    if (!formatPointerValue || !POINTERS_WITH_HOVER.has(event.pointerType)) return

    const track = event.currentTarget.getBoundingClientRect()
    setPointerValue({
      x: event.clientX,
      y: track.top + track.height / 2 - THUMB_SIZE / 2 - TOOLTIP_OFFSET,
      value: valueAtPointer({
        pointerX: event.clientX,
        trackLeft: track.left,
        trackWidth: track.width,
        thumbSize: THUMB_SIZE,
        max,
        step
      })
    })
  }

  // Taken over from the browser, which would move the slider one step.
  const moveWithArrowKey = (event: KeyboardEvent<HTMLInputElement>) => {
    const direction = ARROW_KEY_DIRECTIONS[event.key]
    if (!arrowKeyStep || direction === undefined) return
    event.preventDefault()
    moveBy(direction * arrowKeyStep)
  }

  return (
    <>
      <Input
        ref={inputRef}
        type="range"
        min={0}
        max={max}
        step={step}
        value={shownValue}
        disabled={isDisabled}
        aria-label={label}
        aria-valuetext={valueText}
        onChange={event => onChange(Number(event.target.value))}
        onWheel={moveWithWheel}
        onKeyDown={moveWithArrowKey}
        onPointerDown={() => setIsFocusedByPointer(true)}
        onPointerMove={followPointer}
        onPointerLeave={() => setPointerValue(null)}
        onBlur={() => setIsFocusedByPointer(false)}
        style={
          {
            background: trackFill(fillEnd(shownValue, max)),
            '--slider-thumb-size': `${THUMB_SIZE}px`
          } as CSSProperties
        }
        className={`${SLIDER_CLASSES} ${DISABLED_CLASSES} ${isFocusedByPointer ? POINTER_FOCUS_CLASSES : KEYBOARD_FOCUS_CLASSES}`}
      />
      {formatPointerValue && pointerValue && !isDisabled && (
        <Tooltip
          text={formatPointerValue(pointerValue.value)}
          x={pointerValue.x}
          y={pointerValue.y}
        />
      )}
    </>
  )
}
