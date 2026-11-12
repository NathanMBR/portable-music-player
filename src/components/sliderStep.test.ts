import { describe, expect, it } from 'vitest'
import { snapToStep } from './sliderStep'

// The browser stops a slider's thumb on the step nearest its value, so the fill has to end there too.
describe('snapToStep', () => {
  it('stops on the nearest tenth when the step is a tenth', () => {
    expect(snapToStep(12.34, 0.1)).toBeCloseTo(12.3)
    expect(snapToStep(12.36, 0.1)).toBeCloseTo(12.4)
  })

  it('stops on the nearest whole number when the step is one', () => {
    expect(snapToStep(40.6, 1)).toBe(41)
  })

  it('leaves a value that is already on a step where it is', () => {
    expect(snapToStep(83.5, 0.1)).toBeCloseTo(83.5)
  })
})
