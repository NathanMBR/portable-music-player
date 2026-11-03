import { Input } from '@headlessui/react'
import { useState } from 'react'
import { DISABLED_CLASSES } from '../buttonStyles'

type SliderProps = {
  /** Accessible name, since the slider shows no text of its own. */
  label: string
  /** Where the thumb sits, from 0 to `max`. */
  value: number
  /** The value at the right end of the track. */
  max: number
  /** What screen readers hear for the value, like "40%" or "01:23 of 04:30". */
  valueText: string
  /** Runs with the new value when the slider is dragged, clicked or moved from the keyboard. */
  onChange: (value: number) => void
  /** Fades the slider and ignores input, like the song's position while its length is unknown. */
  isDisabled?: boolean
}

// The browser's own slider leaves the end of its track uncovered at the maximum, so the track and
// the thumb are drawn here. The thumb stays inside the track, so at the maximum it covers its end.
// WebKitGTK and WebView2 both style the thumb through -webkit-.
const SLIDER_CLASSES =
  'block h-1.5 w-full appearance-none rounded-full [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pen'

// A wider ring than the shared one, so it clears the thumb, which is taller than the track.
const KEYBOARD_FOCUS_CLASSES =
  'data-focus:outline-2 data-focus:outline-offset-4 data-focus:outline-pen'

// Headless UI rings inputs however they get focus, like text fields, but a slider clicked with the
// mouse doesn't need a ring. outline-none also hides the browser's own ring in that case.
const POINTER_FOCUS_CLASSES = 'outline-none'

const toPercent = (value: number, max: number) => (max > 0 ? (value / max) * 100 : 0)

// The track is pen up to the value and rule after it.
const trackFill = (percent: number) =>
  `linear-gradient(to right, var(--color-pen) ${percent}%, var(--color-rule) ${percent}%)`

/**
 * A slider in the app's look: its track is pen up to the value and rule after it, with a pen thumb
 * that stays inside the track. Dragging, clicking and the keyboard (arrows, Page Up and Down, Home,
 * End) move it. Reached from the keyboard it shows a focus ring, wider than other controls' so it
 * clears the thumb; clicked with the mouse it doesn't. It fills its container's width, so the
 * parent sets how wide it is.
 *
 * @summary Slider with a drawn track and a keyboard-only focus ring
 */
export const Slider = ({
  label,
  value,
  max,
  valueText,
  onChange,
  isDisabled = false
}: SliderProps) => {
  const [isFocusedByPointer, setIsFocusedByPointer] = useState(false)

  return (
    <Input
      type="range"
      min={0}
      max={max}
      value={value}
      disabled={isDisabled}
      aria-label={label}
      aria-valuetext={valueText}
      onChange={event => onChange(Number(event.target.value))}
      onPointerDown={() => setIsFocusedByPointer(true)}
      onBlur={() => setIsFocusedByPointer(false)}
      style={{ background: trackFill(toPercent(value, max)) }}
      className={`${SLIDER_CLASSES} ${DISABLED_CLASSES} ${isFocusedByPointer ? POINTER_FOCUS_CLASSES : KEYBOARD_FOCUS_CLASSES}`}
    />
  )
}
