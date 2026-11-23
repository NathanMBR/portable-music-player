import { describe, expect, it } from 'vitest'
import { placementIndex } from './songPlacement'

const SONGS = [
  'Disposable Heroes.mp3',
  'Sugar.mp3',
  'The Rage of the Waters.mp3',
  'For Whom the Bell Tolls.mp3'
]

describe('placementIndex', () => {
  it('places a song before one further down', () => {
    expect(
      placementIndex(SONGS, 'Disposable Heroes.mp3', 'For Whom the Bell Tolls.mp3', 'before')
    ).toBe(2)
  })

  it('places a song after one further down', () => {
    expect(
      placementIndex(SONGS, 'Disposable Heroes.mp3', 'The Rage of the Waters.mp3', 'after')
    ).toBe(2)
  })

  it('places a song before one further up', () => {
    expect(placementIndex(SONGS, 'For Whom the Bell Tolls.mp3', 'Sugar.mp3', 'before')).toBe(1)
  })

  it('places a song after one further up', () => {
    expect(
      placementIndex(SONGS, 'For Whom the Bell Tolls.mp3', 'Disposable Heroes.mp3', 'after')
    ).toBe(1)
  })

  it('leaves a song where it is when it already sits there', () => {
    expect(placementIndex(SONGS, 'Sugar.mp3', 'Disposable Heroes.mp3', 'after')).toBe(1)
    expect(placementIndex(SONGS, 'Sugar.mp3', 'The Rage of the Waters.mp3', 'before')).toBe(1)
  })
})
