import { describe, expect, it } from 'vitest'
import { firstSongThatMayHaveCover } from './coverSearch'
import type { Cover } from './coverStore'

const pathOf = (title: string) => `Songs/${title}.mp3`

const MISSING: Cover = { kind: 'missing' }
const READING: Cover = { kind: 'reading' }
const SHOWN: Cover = { kind: 'shown', url: 'blob:cover' }

const coversOf = (entries: [string, Cover][]) => new Map(entries)

describe('firstSongThatMayHaveCover', () => {
  it('is the first song while none of the covers is known yet', () => {
    const paths = [pathOf('Nothing Left to Say but Goodbye'), pathOf('Science')]

    expect(firstSongThatMayHaveCover(paths, new Map())).toBe(
      pathOf('Nothing Left to Say but Goodbye')
    )
  })

  it('passes over the songs known to have no cover, to the first whose cover is still unread', () => {
    const paths = [pathOf('Highway Song'), pathOf("Doesn't Remind Me"), pathOf('Escape')]
    const covers = coversOf([
      [pathOf('Highway Song'), MISSING],
      [pathOf('Escape'), SHOWN]
    ])

    expect(firstSongThatMayHaveCover(paths, covers)).toBe(pathOf("Doesn't Remind Me"))
  })

  it('stops at a song whose cover is shown or still being read', () => {
    const paths = [pathOf('Jewel of the Summertime'), pathOf('Visions Prelude')]

    expect(
      firstSongThatMayHaveCover(
        paths,
        coversOf([
          [pathOf('Jewel of the Summertime'), MISSING],
          [pathOf('Visions Prelude'), READING]
        ])
      )
    ).toBe(pathOf('Visions Prelude'))
    expect(
      firstSongThatMayHaveCover(paths, coversOf([[pathOf('Jewel of the Summertime'), SHOWN]]))
    ).toBe(pathOf('Jewel of the Summertime'))
  })

  it('finds none once every song is known to have no cover', () => {
    const paths = [pathOf('Highway 27'), pathOf('Extreme Dream')]
    const covers = coversOf(paths.map(path => [path, MISSING]))

    expect(firstSongThatMayHaveCover(paths, covers)).toBeUndefined()
  })

  it('finds none among no songs', () => {
    expect(firstSongThatMayHaveCover([], new Map())).toBeUndefined()
  })
})
