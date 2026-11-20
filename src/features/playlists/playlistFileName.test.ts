import { describe, expect, it } from 'vitest'
import { playlistFileName } from './playlistFileName'

const CREATED_AT = 1763581234567

describe('playlistFileName', () => {
  it('starts with when it was created, then the title with underscores for spaces', () => {
    expect(playlistFileName('Road trip', CREATED_AT)).toBe('1763581234567-Road_trip.json')
  })

  it('folds accented letters to their plain form', () => {
    expect(playlistFileName('Canção do mar', CREATED_AT)).toBe('1763581234567-Cancao_do_mar.json')
  })

  it("drops what isn't a plain letter, a digit or a space", () => {
    expect(playlistFileName('Rock & Roll: 80’s_mix!', CREATED_AT)).toBe(
      '1763581234567-Rock__Roll_80smix.json'
    )
  })

  it('drops letters that have no plain form, like ß and æ', () => {
    expect(playlistFileName('Straße æ', CREATED_AT)).toBe('1763581234567-Strae.json')
  })

  it('leaves no underscore at either end', () => {
    expect(playlistFileName('  ¡Fiesta!  ', CREATED_AT)).toBe('1763581234567-Fiesta.json')
  })

  it('falls back to "playlist" when nothing of the title is left', () => {
    expect(playlistFileName('日本の歌', CREATED_AT)).toBe('1763581234567-playlist.json')
  })
})
