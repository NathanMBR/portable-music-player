import { describe, expect, it } from 'vitest'
import { fillEnd } from './sliderFill'

// The browser keeps a slider's thumb inside its track: the thumb's center runs from half a thumb
// after the track's start to half a thumb before its end.
describe('fillEnd', () => {
  it("ends under the thumb's center at the start of the track", () => {
    expect(fillEnd(0, 100)).toEqual({ trackPercent: 0, thumbWidths: 0.5 })
  })

  it("ends under the thumb's center at the end of the track", () => {
    expect(fillEnd(100, 100)).toEqual({ trackPercent: 100, thumbWidths: -0.5 })
  })

  it('ends halfway along the track when the thumb is halfway', () => {
    expect(fillEnd(50, 100)).toEqual({ trackPercent: 50, thumbWidths: 0 })
  })

  it('ends under the thumb at the start while the slider has no length', () => {
    expect(fillEnd(0, 0)).toEqual({ trackPercent: 0, thumbWidths: 0.5 })
  })
})
