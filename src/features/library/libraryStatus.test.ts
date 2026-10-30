import { describe, expect, it } from 'vitest'
import { describeLibraryStatus } from './libraryStatus'
import type { ScanOutcome } from './types'

const loadedWith = (titles: string[]): ScanOutcome => ({
  kind: 'loaded',
  tracks: titles.map(title => ({ path: `Songs/${title}.mp3`, title }))
})

describe('describeLibraryStatus', () => {
  it('says it is scanning while a scan runs, even when an older result exists', () => {
    const olderScan = loadedWith(['Silence and Distance', 'Lasting Child', 'Millennium Sun'])

    expect(describeLibraryStatus(olderScan, true)).toBe('Scanning…')
  })

  it('says nothing before the first scan', () => {
    expect(describeLibraryStatus(null, false)).toBe('')
  })

  it('reports a failed scan', () => {
    expect(describeLibraryStatus({ kind: 'failed' }, false)).toBe('Failed to check songs')
  })

  it('counts one song in the singular', () => {
    expect(describeLibraryStatus(loadedWith(['Arising Thunder']), false)).toBe('1 song')
  })

  it('counts any other number of songs in the plural', () => {
    expect(describeLibraryStatus(loadedWith([]), false)).toBe('0 songs')
    expect(
      describeLibraryStatus(loadedWith(['Unfinished Allegro', 'Gods Of The World']), false)
    ).toBe('2 songs')
  })
})
