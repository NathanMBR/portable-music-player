import { describe, expect, it } from 'vitest'
import { sortTracksByTitle } from './sortTracks'
import type { Track } from './types'

const trackTitled = (title: string): Track => ({ path: `Songs/${title}.mp3`, title })

const sortTitles = (titles: string[]) =>
  sortTracksByTitle(titles.map(trackTitled)).map(track => track.title)

describe('sortTracksByTitle', () => {
  it('ignores case, so lowercase titles are not pushed after every uppercase one', () => {
    expect(sortTitles(['lease of life', 'Judgement Day', 'deep blue', 'Fireworks'])).toEqual([
      'deep blue',
      'Fireworks',
      'Judgement Day',
      'lease of life'
    ])
  })

  it('ignores accents', () => {
    expect(sortTitles(['Awake from Darkness', 'Ángels Cry', 'Ashes'])).toEqual([
      'Ángels Cry',
      'Ashes',
      'Awake from Darkness'
    ])
  })

  it('compares numbers by value', () => {
    expect(sortTitles(['10 Streets of Tomorrow', '2 Petrified Eyes', '1 Time'])).toEqual([
      '1 Time',
      '2 Petrified Eyes',
      '10 Streets of Tomorrow'
    ])
  })

  it('leaves the given list untouched', () => {
    const tracks = ['Waiting Silence', 'Mystery Machine'].map(trackTitled)
    sortTracksByTitle(tracks)
    expect(tracks.map(track => track.title)).toEqual(['Waiting Silence', 'Mystery Machine'])
  })
})
