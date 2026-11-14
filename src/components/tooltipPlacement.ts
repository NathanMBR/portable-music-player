import { clamp } from '../clamp'

type TooltipPlacement = {
  /** The anchor's distance from the window's left edge: where the arrow points. */
  anchorX: number
  tooltipWidth: number
  viewportWidth: number
  /** How far the tooltip keeps from the window's edges. */
  collisionPadding: number
  /** How far the arrow's center keeps from the tooltip's sides, clear of its rounded corners. */
  arrowPadding: number
}

/**
 * Where a tooltip pointing at an anchor goes: centered on it, unless that would put it past the
 * window's edges, where it shifts to stop `collisionPadding` inside, and its arrow moves along it to
 * keep pointing at the anchor. `left` is from the window's left edge, `arrowX` from the tooltip's.
 */
export const placeTooltip = ({
  anchorX,
  tooltipWidth,
  viewportWidth,
  collisionPadding,
  arrowPadding
}: TooltipPlacement) => {
  const rightmostLeft = viewportWidth - collisionPadding - tooltipWidth
  const left = Math.max(collisionPadding, Math.min(anchorX - tooltipWidth / 2, rightmostLeft))
  const arrowX = clamp(anchorX - left, arrowPadding, tooltipWidth - arrowPadding)
  return { left, arrowX }
}
