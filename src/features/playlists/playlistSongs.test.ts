import { describe, expect, it } from 'vitest'
import type { ScanOutcome, Track } from '../library/types'
import {
  editedSongs,
  findPlaylistSongs,
  foundPathsOf,
  hasMissingSongs,
  missingSongsOf,
  pickedFileNames,
  pickedPathsIn,
  playableTracksOf,
  songNameOf
} from './playlistSongs'
import type { SavedPlaylist } from './types'

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

const sideBySide: SavedPlaylist = {
  fileName: '1763581234567-Side_by_side.json',
  title: 'Side by side',
  description: '',
  allSongsFound: true,
  songs: ['Getaway Car.mp3', 'Soldier Side.mp3']
}

describe('missingSongsOf', () => {
  it("names the songs the scan lacks, in the playlist's order, a name in another case included", () => {
    const missing = missingSongsOf(
      ['Getaway Car.mp3', 'over your head.MP3', 'Soldier Side.mp3'],
      [overYourHead, soldierSide]
    )

    expect(missing).toEqual(['Getaway Car.mp3', 'over your head.MP3'])
  })
})

describe('hasMissingSongs', () => {
  it('says so once the scan lacks one of its songs, whatever its file says', () => {
    const scan: ScanOutcome = { kind: 'loaded', tracks: [getawayCar] }

    expect(hasMissingSongs(sideBySide, scan)).toBe(true)
  })

  it('says none are missing once the scan has them all, whatever its file says', () => {
    const scan: ScanOutcome = { kind: 'loaded', tracks: [soldierSide, getawayCar] }

    expect(hasMissingSongs({ ...sideBySide, allSongsFound: false }, scan)).toBe(false)
  })

  it('says what its file says until the first scan ends', () => {
    expect(hasMissingSongs(sideBySide, null)).toBe(false)
    expect(hasMissingSongs({ ...sideBySide, allSongsFound: false }, null)).toBe(true)
  })

  it("finds them all missing when the Songs folder couldn't be scanned", () => {
    expect(hasMissingSongs(sideBySide, { kind: 'failed' })).toBe(true)
  })

  it('finds none missing in a playlist without songs', () => {
    expect(hasMissingSongs({ ...sideBySide, songs: [] }, { kind: 'failed' })).toBe(false)
  })
})

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

  it('finds no song for a file name in another case, like the check in Rust', () => {
    const songs = findPlaylistSongs(['soldier side.MP3'], [soldierSide])

    expect(songs).toEqual([{ fileName: 'soldier side.MP3', track: null }])
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

const ironSoul: Track = { path: 'Songs/Iron Soul.mp3', title: 'Iron Soul', artist: 'Shaman' }
const boatSong: Track = { path: 'Songs/Boat Song.mp3', title: 'Boat Song', artist: 'Woodkid' }
const sugar: Track = { path: 'Songs/Sugar.mp3', title: 'Sugar', artist: 'System of a Down' }

describe('foundPathsOf', () => {
  it("lists the paths of the songs the scan found in the playlist's order, without the missing ones", () => {
    const paths = foundPathsOf(['Sugar.mp3', 'Iron Soul.mp3', 'Boat Song.mp3'], [boatSong, sugar])

    expect(paths).toEqual([sugar.path, boatSong.path])
  })

  it('finds no song for a file name in another case, like the check in Rust', () => {
    expect(foundPathsOf(['iron soul.mp3'], [ironSoul])).toEqual([])
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
  it("holds the paths of the playlist's songs the scan found, by their exact file name", () => {
    const picked = pickedPathsIn(
      ['Set It Off.mp3', 'Chop Suey!.mp3', 'crossing.MP3'],
      [crossing, nothingToSay, setItOff]
    )

    expect(picked).toEqual(new Set([setItOff.path]))
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

  it('keeps a name in another case as a missing song, apart from the scanned song picked', () => {
    expect(editedSongs(['set it off.MP3'], tracks, new Set([setItOff.path]))).toEqual([
      'set it off.MP3',
      'Set It Off.mp3'
    ])
  })
})
