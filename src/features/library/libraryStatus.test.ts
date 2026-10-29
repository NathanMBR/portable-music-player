import { describe, expect, it } from 'vitest'
import { describeLibraryStatus } from './libraryStatus'
import { SAMPLE_TRACKS } from './sampleTracks'
import type { ScanOutcome } from './types'

const loadedWith = (count: number): ScanOutcome => ({
  kind: 'loaded',
  tracks: SAMPLE_TRACKS.slice(0, count)
})

describe('describeLibraryStatus', () => {
  it('says it is scanning while a scan runs, even when an older result exists', () => {
    expect(describeLibraryStatus(loadedWith(3), true)).toBe('Scanning…')
  })

  it('says nothing before the first scan', () => {
    expect(describeLibraryStatus(null, false)).toBe('')
  })

  it('reports a failed scan', () => {
    expect(describeLibraryStatus({ kind: 'failed' }, false)).toBe('Failed to check songs')
  })

  it('counts one song in the singular', () => {
    expect(describeLibraryStatus(loadedWith(1), false)).toBe('1 song')
  })

  it('counts any other number of songs in the plural', () => {
    expect(describeLibraryStatus(loadedWith(0), false)).toBe('0 songs')
    expect(describeLibraryStatus(loadedWith(2), false)).toBe('2 songs')
  })
})
