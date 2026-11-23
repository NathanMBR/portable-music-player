import { describe, expect, it } from 'vitest'
import type { Track } from '../library/types'
import { matchesPlaylistSearch, matchesSearch } from './songSearch'

const theOtherSide: Track = {
  path: 'Songs/The Other Side.mp3',
  title: 'The Other Side',
  artist: 'Woodkid'
}
const nuguns: Track = { path: 'Songs/Nüguns.mp3', title: 'Nüguns', artist: 'System of a Down' }
const petrifiedEyes: Track = {
  path: 'Songs/04 - Petrified Eyes.mp3',
  title: 'Petrified Eyes',
  artist: 'Angra'
}
const iron: Track = { path: 'Songs/Iron.mp3', title: 'Iron', artist: null }

describe('matchesSearch', () => {
  it('finds a song by part of its title', () => {
    expect(matchesSearch(theOtherSide, 'other')).toBe(true)
  })

  it('finds a song by part of its artist', () => {
    expect(matchesSearch(nuguns, 'system')).toBe(true)
  })

  it('finds a song by part of its file name', () => {
    expect(matchesSearch(petrifiedEyes, '04 -')).toBe(true)
  })

  it('ignores case on both sides', () => {
    expect(matchesSearch(theOtherSide, 'WOODKID')).toBe(true)
  })

  it('ignores accents on both sides', () => {
    expect(matchesSearch(nuguns, 'nuguns')).toBe(true)
    expect(matchesSearch(iron, 'írón')).toBe(true)
  })

  it('leaves out a song that matches nowhere', () => {
    expect(matchesSearch(iron, 'angra')).toBe(false)
  })

  it('finds every song while the search is blank', () => {
    expect(matchesSearch(petrifiedEyes, '   ')).toBe(true)
  })
})

describe('matchesPlaylistSearch', () => {
  const inTheNight: Track = {
    path: 'Songs/In the Night.mp3',
    title: 'In the Night',
    artist: 'Shaman'
  }

  it('finds a song by its position in the playlist', () => {
    expect(
      matchesPlaylistSearch({ fileName: 'In the Night.mp3', track: inTheNight }, 3, ' 3 ')
    ).toBe(true)
  })

  it('finds a position only whole, so 1 finds the first song and not the twelfth', () => {
    expect(
      matchesPlaylistSearch({ fileName: 'In the Night.mp3', track: inTheNight }, 12, '1')
    ).toBe(false)
  })

  it('still finds a song by its title, artist or file name', () => {
    expect(
      matchesPlaylistSearch({ fileName: 'In the Night.mp3', track: inTheNight }, 2, 'SHAMAN')
    ).toBe(true)
  })

  it('finds a song the last scan lacks by its file name, case and accents folded', () => {
    expect(
      matchesPlaylistSearch({ fileName: 'Viderunt Te Aquae.mp3', track: null }, 5, 'vídérunt')
    ).toBe(true)
  })

  it('leaves out a song the last scan lacks when its file name holds nothing of the search', () => {
    expect(
      matchesPlaylistSearch({ fileName: 'Viderunt Te Aquae.mp3', track: null }, 5, 'night')
    ).toBe(false)
  })
})
