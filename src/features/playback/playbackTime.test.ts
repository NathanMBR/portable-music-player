import { describe, expect, it } from 'vitest'
import {
  formatCountdown,
  formatPlaybackTime,
  progressFraction,
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

describe('progressFraction', () => {
  it('is the share of the song already played', () => {
    expect(progressFraction(67.5, 270)).toBe(0.25)
  })

  it('is zero while the length is unknown', () => {
    expect(progressFraction(83, null)).toBe(0)
  })

  it('stays between zero and one', () => {
    expect(progressFraction(275, 270)).toBe(1)
    expect(progressFraction(0, 0)).toBe(0)
  })
})
