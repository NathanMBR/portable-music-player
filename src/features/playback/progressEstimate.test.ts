import { describe, expect, it } from 'vitest'
import { anchorAfterReport, estimateProgress } from './progressEstimate'

describe('estimateProgress', () => {
  it('runs on with the clock from where the audio last was', () => {
    const anchor = { seconds: 10, atMs: 1000 }

    expect(estimateProgress({ anchor, reportedSeconds: 10, durationSeconds: 270 }, 4000)).toBe(13)
  })

  it("goes no further than 10 seconds past the audio's last report", () => {
    const anchor = { seconds: 10, atMs: 0 }

    expect(estimateProgress({ anchor, reportedSeconds: 10, durationSeconds: 270 }, 15000)).toBe(20)
  })

  it("stops at the song's end", () => {
    const anchor = { seconds: 28, atMs: 0 }

    expect(estimateProgress({ anchor, reportedSeconds: 28, durationSeconds: 30 }, 5000)).toBe(30)
  })

  it("runs on while the song's length is unknown", () => {
    const anchor = { seconds: 28, atMs: 0 }

    expect(estimateProgress({ anchor, reportedSeconds: 28, durationSeconds: null }, 5000)).toBe(33)
  })
})

describe('anchorAfterReport', () => {
  it('starts from the first report', () => {
    const report = { seconds: 10, atMs: 0 }

    expect(anchorAfterReport(null, report)).toEqual(report)
  })

  it('follows the audio when it reports a time ahead of the progress', () => {
    const report = { seconds: 14, atMs: 1000 }

    expect(anchorAfterReport({ seconds: 10, atMs: 0 }, report)).toEqual(report)
  })

  it("keeps running from the same place while the audio's clock catches up", () => {
    const anchor = { seconds: 10, atMs: 0 }

    expect(anchorAfterReport(anchor, { seconds: 11, atMs: 3000 })).toEqual(anchor)
  })

  it('trusts the audio once it falls more than 10 seconds behind the progress', () => {
    const report = { seconds: 11, atMs: 12000 }

    expect(anchorAfterReport({ seconds: 10, atMs: 0 }, report)).toEqual(report)
  })
})
