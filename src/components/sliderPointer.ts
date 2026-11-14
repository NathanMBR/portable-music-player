import { clamp } from '../clamp'
import { snapToStep } from './sliderStep'

type PointerOnSlider = {
  /** The pointer's distance from the window's left edge. */
  pointerX: number
  /** The track's distance from the window's left edge. */
  trackLeft: number
  trackWidth: number
  thumbSize: number
  max: number
  step: number
}

/**
 * The value a click at `pointerX` gives a slider. The browser puts the thumb's center under the
 * click, keeping the thumb inside the track, so the center runs from half a thumb after the track's
 * start (0) to half a thumb before its end (`max`), and stops on the nearest step.
 */
export const valueAtPointer = ({
  pointerX,
  trackLeft,
  trackWidth,
  thumbSize,
  max,
  step
}: PointerOnSlider) => {
  const thumbTravel = trackWidth - thumbSize
  if (thumbTravel <= 0) return 0

  const share = clamp((pointerX - trackLeft - thumbSize / 2) / thumbTravel, 0, 1)
  return snapToStep(share * max, step)
}
