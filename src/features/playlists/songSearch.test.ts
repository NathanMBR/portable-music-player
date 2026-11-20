import { describe, expect, it } from 'vitest'
import type { Track } from '../library/types'
import { matchesSearch } from './songSearch'

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
