import { describe, expect, it } from 'vitest'
import { fittedPathLength } from './fittedPathLength'

describe('fittedPathLength', () => {
  it('rounds a path up to a whole number of dash patterns', () => {
    expect(fittedPathLength(300, 28)).toBe(308)
  })

  it('rounds a path down to a whole number of dash patterns', () => {
    expect(fittedPathLength(290, 28)).toBe(280)
  })

  it('keeps one dash pattern on a path shorter than half of one', () => {
    expect(fittedPathLength(10, 28)).toBe(28)
  })
})
