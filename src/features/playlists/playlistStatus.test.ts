import { describe, expect, it } from 'vitest'
import { describePlaylist, describePlaylistsStatus } from './playlistStatus'
import type { SavedPlaylist } from './types'

const roadTrip: SavedPlaylist = {
  fileName: '1763581234567-Road_trip.json',
  title: 'Road trip',
  description: 'For the long drive',
  allSongsFound: true,
  songs: ['Paradise.mp3', 'Know.mp3']
}

describe('describePlaylistsStatus', () => {
  it('counts the playlists', () => {
    expect(describePlaylistsStatus('loaded', 3)).toBe('3 playlists')
  })

  it('counts one playlist in the singular', () => {
    expect(describePlaylistsStatus('loaded', 1)).toBe('1 playlist')
  })

  it('says nothing without playlists, since the empty state below it says why', () => {
    expect(describePlaylistsStatus('loaded', 0)).toBe('')
  })

  it('says nothing before the playlists are listed, or when listing them failed', () => {
    expect(describePlaylistsStatus('loading', 0)).toBe('')
    expect(describePlaylistsStatus('failed', 0)).toBe('')
  })
})

describe('describePlaylist', () => {
  it('counts the songs, then gives the description', () => {
    expect(describePlaylist(roadTrip)).toBe('2 songs · For the long drive')
  })

  it('only counts the songs of a playlist without a description', () => {
    expect(describePlaylist({ ...roadTrip, description: '' })).toBe('2 songs')
  })
})
