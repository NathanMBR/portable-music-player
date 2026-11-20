import { describe, expect, it } from 'vitest'
import { stackClearances } from './bottomClearance'

describe('stackClearances', () => {
  it('adds up the room of everything at the bottom of the window', () => {
    expect(stackClearances(['var(--spacing-player)', '3.5rem'])).toBe(
      'calc(var(--spacing-player) + 3.5rem)'
    )
  })

  it('keeps a single room as it is', () => {
    expect(stackClearances(['3.5rem'])).toBe('3.5rem')
  })

  it('keeps no room when nothing is at the bottom', () => {
    expect(stackClearances([])).toBeUndefined()
  })
})
