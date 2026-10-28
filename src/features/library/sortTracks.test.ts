import { describe, expect, it } from 'vitest'
import { sortTracksByTitle } from './sortTracks'
import type { Track } from './types'

const trackTitled = (title: string): Track => ({ path: `Songs/${title}.mp3`, title })

const sortTitles = (titles: string[]) =>
  sortTracksByTitle(titles.map(trackTitled)).map(track => track.title)

describe('sortTracksByTitle', () => {
  it('ignores case, so lowercase titles are not pushed after every uppercase one', () => {
    expect(sortTitles(['banana', 'Cherry', 'apple', 'Blueberry'])).toEqual([
      'apple',
      'banana',
      'Blueberry',
      'Cherry'
    ])
  })

  it('ignores accents', () => {
    expect(sortTitles(['Ezra', 'Ébano', 'Ecco'])).toEqual(['Ébano', 'Ecco', 'Ezra'])
  })

  it('compares numbers by value', () => {
    expect(sortTitles(['Track 10', 'Track 2', 'Track 1'])).toEqual([
      'Track 1',
      'Track 2',
      'Track 10'
    ])
  })

  it('leaves the given list untouched', () => {
    const tracks = ['b', 'a'].map(trackTitled)
    sortTracksByTitle(tracks)
    expect(tracks.map(track => track.title)).toEqual(['b', 'a'])
  })
})
