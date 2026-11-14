import { describe, expect, it } from 'vitest'
import { placeTooltip } from './tooltipPlacement'

// A 60px tooltip in a 1000px window, kept 8px from its edges, with its arrow 12px clear of its sides.
const TOOLTIP = { tooltipWidth: 60, viewportWidth: 1000, collisionPadding: 8, arrowPadding: 12 }

describe('placeTooltip', () => {
  it('centers the tooltip on the anchor when it fits', () => {
    expect(placeTooltip({ ...TOOLTIP, anchorX: 500 })).toEqual({ left: 470, arrowX: 30 })
  })

  it('keeps the tooltip inside the left edge, moving its arrow to the anchor', () => {
    expect(placeTooltip({ ...TOOLTIP, anchorX: 30 })).toEqual({ left: 8, arrowX: 22 })
  })

  it('keeps the tooltip inside the right edge, moving its arrow to the anchor', () => {
    expect(placeTooltip({ ...TOOLTIP, anchorX: 980 })).toEqual({ left: 932, arrowX: 48 })
  })

  it("keeps the arrow clear of the tooltip's rounded corners", () => {
    expect(placeTooltip({ ...TOOLTIP, anchorX: 10 })).toEqual({ left: 8, arrowX: 12 })
    expect(placeTooltip({ ...TOOLTIP, anchorX: 995 })).toEqual({ left: 932, arrowX: 48 })
  })

  it('keeps the left padding in a window too narrow for the tooltip', () => {
    expect(placeTooltip({ ...TOOLTIP, viewportWidth: 50, anchorX: 25 }).left).toBe(8)
  })
})
