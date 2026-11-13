import { describe, expect, it } from 'vitest'
import { fileNameOf, fullTrackName } from './trackName'

describe('fullTrackName', () => {
  it('follows the title with the artist, past a middle dot', () => {
    const track = {
      path: 'Songs/The Last Remaining Light.mp3',
      title: 'The Last Remaining Light',
      artist: 'Audioslave'
    }

    expect(fullTrackName(track)).toBe('The Last Remaining Light · Audioslave')
  })

  it('is only the title for a song without an artist', () => {
    const track = { path: 'Songs/Boat Song.mp3', title: 'Boat Song', artist: null }

    expect(fullTrackName(track)).toBe('Boat Song')
  })
})

describe('fileNameOf', () => {
  it("is the song's file name, without its folder but with its extension", () => {
    const track = { path: 'Songs/Mama Said.mp3', title: 'Mama Said', artist: 'Metallica' }

    expect(fileNameOf(track)).toBe('Mama Said.mp3')
  })
})
