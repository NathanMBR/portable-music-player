import { describe, expect, it } from 'vitest'
import type { Track } from '../library/types'
import { findPlaylistSongs, pickedFileNames, playableTracksOf, songNameOf } from './playlistSongs'

const overYourHead: Track = {
  path: 'Songs/Over Your Head.mp3',
  title: 'Over Your Head',
  artist: 'Shaman'
}
const soldierSide: Track = {
  path: 'Songs/Soldier Side.mp3',
  title: 'Soldier Side',
  artist: 'System of a Down'
}
const getawayCar: Track = {
  path: 'Songs/Getaway Car.mp3',
  title: 'Getaway Car',
  artist: 'Audioslave'
}

describe('findPlaylistSongs', () => {
  it("pairs each file name with the scanned song it names, in the playlist's order", () => {
    const songs = findPlaylistSongs(
      ['Soldier Side.mp3', 'Over Your Head.mp3'],
      [overYourHead, getawayCar, soldierSide]
    )

    expect(songs).toEqual([
      { fileName: 'Soldier Side.mp3', track: soldierSide },
      { fileName: 'Over Your Head.mp3', track: overYourHead }
    ])
  })

  it('leaves a song the last scan lacks without its track', () => {
    const songs = findPlaylistSongs(['Sound of a Gun.mp3', 'Getaway Car.mp3'], [getawayCar])

    expect(songs).toEqual([
      { fileName: 'Sound of a Gun.mp3', track: null },
      { fileName: 'Getaway Car.mp3', track: getawayCar }
    ])
  })

  it('finds a song whatever the case of its file name, like the drive does', () => {
    const songs = findPlaylistSongs(['soldier side.MP3'], [soldierSide])

    expect(songs).toEqual([{ fileName: 'soldier side.MP3', track: soldierSide }])
  })
})

describe('songNameOf', () => {
  it("is a found song's title", () => {
    expect(songNameOf({ fileName: 'Over Your Head.mp3', track: overYourHead })).toBe(
      'Over Your Head'
    )
  })

  it("is a missing song's file name without its extension", () => {
    expect(songNameOf({ fileName: 'Out of Exile.mp3', track: null })).toBe('Out of Exile')
  })
})

describe('playableTracksOf', () => {
  it('keeps the found songs, in order, without the missing ones', () => {
    const tracks = playableTracksOf([
      { fileName: 'Getaway Car.mp3', track: getawayCar },
      { fileName: 'In the Night.mp3', track: null },
      { fileName: 'Soldier Side.mp3', track: soldierSide }
    ])

    expect(tracks).toEqual([getawayCar, soldierSide])
  })
})

describe('pickedFileNames', () => {
  it("lists the picked songs' file names in the list's order, whatever order they were picked in", () => {
    const picked = new Set([soldierSide.path, overYourHead.path])

    expect(pickedFileNames([overYourHead, getawayCar, soldierSide], picked)).toEqual([
      'Over Your Head.mp3',
      'Soldier Side.mp3'
    ])
  })
})
