import { describe, expect, it } from 'vitest'
import {
  formatCountdown,
  formatPlaybackTime,
  formatPreciseTime,
  formatTenthsTime,
  remainingSeconds
} from './playbackTime'

describe('formatPlaybackTime', () => {
  it('pads minutes and seconds to two digits', () => {
    expect(formatPlaybackTime(0)).toBe('00:00')
    expect(formatPlaybackTime(83)).toBe('01:23')
  })

  it('drops fractions of a second', () => {
    expect(formatPlaybackTime(59.9)).toBe('00:59')
  })

  it('keeps counting minutes past an hour', () => {
    expect(formatPlaybackTime(4504)).toBe('75:04')
  })

  it('shows an unknown time as dashes', () => {
    expect(formatPlaybackTime(null)).toBe('--:--')
  })
})

describe('formatCountdown', () => {
  it('puts a minus sign before the time', () => {
    expect(formatCountdown(187)).toBe('-03:07')
  })

  it('shows an unknown time as dashes, without a sign', () => {
    expect(formatCountdown(null)).toBe('--:--')
  })
})

describe('remainingSeconds', () => {
  it('adds up with the elapsed time on screen to the length of the song', () => {
    // 83.6 seconds in shows 01:23, and a 270.4-second song shows 04:30: 01:23 + 03:07.
    expect(remainingSeconds(83.6, 270.4)).toBe(187)
  })

  it('is unknown while the length is', () => {
    expect(remainingSeconds(83, null)).toBeNull()
  })

  it('never goes below zero', () => {
    expect(remainingSeconds(275, 270)).toBe(0)
  })
})

describe('formatTenthsTime', () => {
  it('shows minutes and seconds like the player, then the tenths', () => {
    expect(formatTenthsTime(0)).toBe('00:00.0')
    expect(formatTenthsTime(83.44)).toBe('01:23.4')
  })

  it('keeps counting minutes past an hour', () => {
    expect(formatTenthsTime(3725.2)).toBe('62:05.2')
  })

  it('carries a tenth rounded up into the seconds', () => {
    expect(formatTenthsTime(59.96)).toBe('01:00.0')
  })
})

describe('formatPreciseTime', () => {
  it('shows minutes and seconds like the player, then the milliseconds', () => {
    expect(formatPreciseTime(0)).toBe('00:00.000')
    expect(formatPreciseTime(83.4)).toBe('01:23.400')
  })

  it('keeps counting minutes past an hour', () => {
    expect(formatPreciseTime(3725.25)).toBe('62:05.250')
  })

  it('carries a millisecond rounded up into the seconds', () => {
    expect(formatPreciseTime(59.9996)).toBe('01:00.000')
  })
})
