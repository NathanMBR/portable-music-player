import { describe, expect, it } from 'vitest'
import { fileNameOf, fullTrackName, withoutExtension } from './trackName'

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

describe('withoutExtension', () => {
  it('drops the extension after the last dot', () => {
    expect(withoutExtension('Time Will Come.mp3')).toBe('Time Will Come')
  })

  it('keeps a name whose only dot starts it', () => {
    expect(withoutExtension('.Reason')).toBe('.Reason')
  })
})
