import { describe, expect, it } from 'vitest'
import { valueAtPointer } from './sliderPointer'

// A 214px track from x = 100 with a 14px thumb: the thumb's center runs from 107 to 307.
const TRACK = { trackLeft: 100, trackWidth: 214, thumbSize: 14, max: 100, step: 1 }

describe('valueAtPointer', () => {
  it('gives 0 half a thumb after the start of the track', () => {
    expect(valueAtPointer({ ...TRACK, pointerX: 107 })).toBe(0)
  })

  it('gives the maximum half a thumb before the end of the track', () => {
    expect(valueAtPointer({ ...TRACK, pointerX: 307 })).toBe(100)
  })

  it('gives half the maximum halfway between those two', () => {
    expect(valueAtPointer({ ...TRACK, pointerX: 207 })).toBe(50)
  })

  it('keeps to the ends past them, where the thumb stops', () => {
    expect(valueAtPointer({ ...TRACK, pointerX: 101 })).toBe(0)
    expect(valueAtPointer({ ...TRACK, pointerX: 313 })).toBe(100)
  })

  it('snaps to the nearest step, where the thumb stops', () => {
    expect(valueAtPointer({ ...TRACK, step: 10, pointerX: 175 })).toBe(30)
  })

  it('gives 0 on a track no wider than its thumb', () => {
    expect(valueAtPointer({ ...TRACK, trackWidth: 14, pointerX: 107 })).toBe(0)
  })
})
