import { describe, expect, it } from 'vitest'
import { sortTracks } from './sortTracks'
import type { Track } from './types'

const trackTitled = (title: string, artist: string): Track => ({
  path: `Songs/${title}.mp3`,
  title,
  artist
})

const trackInFile = (fileName: string, title: string, artist: string): Track => ({
  path: `Songs/${fileName}`,
  title,
  artist
})

const sortTitles = (titles: string[]) =>
  sortTracks(
    titles.map(title => trackTitled(title, 'Angra')),
    'title'
  ).map(track => track.title)

const pathsByFileName = (tracks: Track[]) => sortTracks(tracks, 'fileName').map(track => track.path)

describe('sortTracks by title', () => {
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
    const tracks = ['Waiting Silence', 'Mystery Machine'].map(title => trackTitled(title, 'Angra'))
    sortTracks(tracks, 'title')
    expect(tracks.map(track => track.title)).toEqual(['Waiting Silence', 'Mystery Machine'])
  })
})

describe('sortTracks by file name', () => {
  it('follows the file names, whatever the titles say', () => {
    const tracks = [
      trackInFile('3 Deep Blue.mp3', 'Deep Blue', 'Angra'),
      trackInFile('1 Ride the Lightning.mp3', 'Ride the Lightning', 'Metallica'),
      trackInFile('2 Rough Stone.mp3', 'Rough Stone', 'Shaman')
    ]

    expect(pathsByFileName(tracks)).toEqual([
      'Songs/1 Ride the Lightning.mp3',
      'Songs/2 Rough Stone.mp3',
      'Songs/3 Deep Blue.mp3'
    ])
  })

  it('leaves the extension out, so a name comes before the same name with more after it', () => {
    const tracks = [
      trackInFile('Iron Soul 2.mp3', 'Iron Soul', 'Shaman'),
      trackInFile('Iron Soul.MP3', 'Iron Soul', 'Shaman')
    ]

    expect(pathsByFileName(tracks)).toEqual(['Songs/Iron Soul.MP3', 'Songs/Iron Soul 2.mp3'])
  })

  it('compares file names like titles: ignoring case, and numbers by value', () => {
    const tracks = [
      trackInFile('Man or Animal.mp3', 'Man or Animal', 'Audioslave'),
      trackInFile('10 Tide Of Changes.mp3', 'Tide Of Changes', 'Angra'),
      trackInFile('disposable heroes.mp3', 'Disposable Heroes', 'Metallica'),
      trackInFile("9 Devil's Dance.mp3", "Devil's Dance", 'Metallica')
    ]

    expect(pathsByFileName(tracks)).toEqual([
      "Songs/9 Devil's Dance.mp3",
      'Songs/10 Tide Of Changes.mp3',
      'Songs/disposable heroes.mp3',
      'Songs/Man or Animal.mp3'
    ])
  })
})
