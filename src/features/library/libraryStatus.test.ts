import { describe, expect, it } from 'vitest'
import { describeLibraryStatus } from './libraryStatus'
import type { ScanOutcome } from './types'

const loadedWith = (titles: string[]): ScanOutcome => ({
  kind: 'loaded',
  tracks: titles.map(title => ({ path: `Songs/${title}.mp3`, title, artist: 'Angra' }))
})

describe('describeLibraryStatus', () => {
  it('says it is scanning while a scan runs, even when an older result exists', () => {
    const olderScan = loadedWith(['Silence and Distance', 'Lasting Child', 'Millennium Sun'])

    expect(describeLibraryStatus(olderScan, true)).toBe('Scanning…')
  })

  it('says nothing before the first scan', () => {
    expect(describeLibraryStatus(null, false)).toBe('')
  })

  it('says nothing after a failed scan, which the view explains below it', () => {
    expect(describeLibraryStatus({ kind: 'failed' }, false)).toBe('')
  })

  it('says nothing when the Songs folder has no songs, which the view explains below it', () => {
    expect(describeLibraryStatus(loadedWith([]), false)).toBe('')
  })

  it('counts one song in the singular', () => {
    expect(describeLibraryStatus(loadedWith(['Arising Thunder']), false)).toBe('1 song')
  })

  it('counts more songs in the plural', () => {
    expect(
      describeLibraryStatus(loadedWith(['Unfinished Allegro', 'Gods Of The World']), false)
    ).toBe('2 songs')
  })
})
