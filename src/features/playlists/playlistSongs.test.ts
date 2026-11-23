import { describe, expect, it } from 'vitest'
import type { Track } from '../library/types'
import {
  editedSongs,
  findPlaylistSongs,
  pickedFileNames,
  pickedPathsIn,
  playableTracksOf,
  songNameOf
} from './playlistSongs'

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

const crossing: Track = { path: 'Songs/Crossing.mp3', title: 'Crossing', artist: 'Angra' }
const nothingToSay: Track = {
  path: 'Songs/Nothing To Say.mp3',
  title: 'Nothing To Say',
  artist: 'Angra'
}
const setItOff: Track = { path: 'Songs/Set It Off.mp3', title: 'Set It Off', artist: 'Audioslave' }
const attitude: Track = { path: 'Songs/Attitude.mp3', title: 'Attitude', artist: 'Metallica' }

describe('pickedPathsIn', () => {
  it("holds the paths of the playlist's songs the scan found, whatever their case", () => {
    const picked = pickedPathsIn(
      ['Set It Off.mp3', 'Chop Suey!.mp3', 'crossing.MP3'],
      [crossing, nothingToSay, setItOff]
    )

    expect(picked).toEqual(new Set([setItOff.path, crossing.path]))
  })
})

describe('editedSongs', () => {
  // In the Songs view's order, as the dialog lists them.
  const tracks = [attitude, crossing, nothingToSay, setItOff]

  it('keeps the songs still picked in their place, without the unpicked ones', () => {
    const songs = editedSongs(
      ['Set It Off.mp3', 'Crossing.mp3', 'Attitude.mp3'],
      tracks,
      new Set([setItOff.path, attitude.path])
    )

    expect(songs).toEqual(['Set It Off.mp3', 'Attitude.mp3'])
  })

  it("adds the newly picked songs at the end, in the list's order", () => {
    const songs = editedSongs(
      ['Set It Off.mp3'],
      tracks,
      new Set([nothingToSay.path, setItOff.path, attitude.path])
    )

    expect(songs).toEqual(['Set It Off.mp3', 'Attitude.mp3', 'Nothing To Say.mp3'])
  })

  it('keeps the songs the scan lacks where they are, since they can be neither picked nor unpicked', () => {
    const songs = editedSongs(
      ['Crossing.mp3', 'Chop Suey!.mp3', 'Set It Off.mp3'],
      tracks,
      new Set([setItOff.path])
    )

    expect(songs).toEqual(['Chop Suey!.mp3', 'Set It Off.mp3'])
  })

  it("keeps a song's file name as the playlist writes it, whatever its case", () => {
    expect(editedSongs(['set it off.MP3'], tracks, new Set([setItOff.path]))).toEqual([
      'set it off.MP3'
    ])
  })
})
