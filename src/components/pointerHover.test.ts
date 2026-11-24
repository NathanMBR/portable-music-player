import { describe, expect, it } from 'vitest'
import { canHover } from './pointerHover'

describe('canHover', () => {
  it('lets a mouse and a pen hover', () => {
    expect(canHover('mouse')).toBe(true)
    expect(canHover('pen')).toBe(true)
  })

  it("doesn't let a finger hover", () => {
    expect(canHover('touch')).toBe(false)
  })
})
