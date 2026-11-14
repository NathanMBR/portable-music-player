import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { placeTooltip } from '../tooltipPlacement'

type TooltipProps = {
  /** What the tooltip says, kept short, like `01:23.4`. */
  text: string
  /** How far from the window's left edge the anchor, the point the arrow points at, is. */
  x: number
  /** How far from the window's top the anchor is: the tooltip sits above it. */
  y: number
}

// How far the tooltip keeps from the window's edges.
const COLLISION_PADDING = 8

const BORDER_WIDTH = 1
const CORNER_RADIUS = 8
const ARROW_WIDTH = 12
const ARROW_HEIGHT = 8

// The arrow's center keeps clear of the rounded corners, so its sides start on the straight edge.
const ARROW_PADDING = CORNER_RADIUS + ARROW_WIDTH / 2

// The arrow's border runs down its two sides only, so the tooltip opens into it. Its point sits
// half a border above the bottom, so the border's outer edge reaches it; the SVG clips what sticks
// out, like the border's ends above the arrow's top.
const ARROW_PATH = `M0 0 L${ARROW_WIDTH / 2} ${ARROW_HEIGHT - BORDER_WIDTH / 2} L${ARROW_WIDTH} 0`

/**
 * A small tooltip with an arrow pointing down at an anchor, a point of the window: the value a
 * click on a slider would set, while the pointer is over it. It shows at once, with no delay or
 * fade, and it's drawn over everything, from `<body>`. Centered above the anchor, it shifts to stay
 * clear of the window's edges, and its arrow then moves along it to keep pointing at the anchor.
 * Screen readers don't hear it: it only previews what the pointer would do.
 *
 * @summary Tooltip with an arrow pointing at an anchor, kept inside the window
 */
export const Tooltip = ({ text, x, y }: TooltipProps) => {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [tooltipWidth, setTooltipWidth] = useState(0)

  // Measured before the browser paints, so the tooltip never shows in the wrong place. The text
  // can change its width at every render, like "9%" turning into "10%".
  useLayoutEffect(() => {
    const width = tooltipRef.current?.getBoundingClientRect().width ?? 0
    if (width !== tooltipWidth) setTooltipWidth(width)
  })

  // And again whenever its width changes between renders, as when the app's font finishes loading
  // after the tooltip first showed in the fallback font.
  useEffect(() => {
    const tooltip = tooltipRef.current
    if (!tooltip) return

    const observer = new ResizeObserver(() =>
      setTooltipWidth(tooltip.getBoundingClientRect().width)
    )
    observer.observe(tooltip)
    return () => observer.disconnect()
  }, [])

  const { left, arrowX } = placeTooltip({
    anchorX: x,
    tooltipWidth,
    viewportWidth: document.documentElement.clientWidth,
    collisionPadding: COLLISION_PADDING,
    arrowPadding: ARROW_PADDING
  })

  // The fragment makes react-docgen see a component, so this JSDoc reaches the docs.
  return (
    <>
      {createPortal(
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-40 flex -translate-y-full flex-col items-start"
          style={{ left, top: y }}
        >
          <div
            ref={tooltipRef}
            className="border-ink bg-paper px-2 py-1 text-sm font-semibold whitespace-nowrap text-ink tabular-nums"
            style={{ borderWidth: BORDER_WIDTH, borderRadius: CORNER_RADIUS }}
          >
            {text}
          </div>
          {/* Over the tooltip's bottom border, so the tooltip opens into the arrow. */}
          <svg
            aria-hidden="true"
            width={ARROW_WIDTH}
            height={ARROW_HEIGHT}
            className="fill-paper stroke-ink"
            style={{ marginTop: -BORDER_WIDTH, marginLeft: arrowX - ARROW_WIDTH / 2 }}
          >
            <path d={ARROW_PATH} strokeWidth={BORDER_WIDTH} />
          </svg>
        </div>,
        document.body
      )}
    </>
  )
}
