import { describe, expect, it } from 'vitest'
import { MAX_LISTED_TAKEN_NAMES } from './constants'
import { listTakenNames, summarizeTakenNames } from './takenNames'

describe('summarizeTakenNames', () => {
  it('speaks of the dropped song when it was the only one', () => {
    expect(summarizeTakenNames({ songCount: 1, conflicts: ['Deer Dance.mp3'], failures: [] })).toBe(
      'The dropped song would replace a song with the same file name:'
    )
  })

  it('speaks of all the dropped songs when every one has a taken name', () => {
    const conflicts = ['Soldier Side.mp3', 'Sprouts of Time.mp3', 'Somedays.mp3']

    expect(summarizeTakenNames({ songCount: 3, conflicts, failures: [] })).toBe(
      'All 3 dropped songs would replace songs with the same file names:'
    )
  })

  it('counts the one song with a taken name among the others', () => {
    const conflicts = ['The Rage of the Waters.mp3']

    expect(summarizeTakenNames({ songCount: 12, conflicts, failures: [] })).toBe(
      '1 of the 12 dropped songs would replace a song with the same file name:'
    )
  })

  it('counts the songs with a taken name among the others', () => {
    const conflicts = ['Metal Icarus.mp3', 'Bad Seed.mp3']

    expect(summarizeTakenNames({ songCount: 15, conflicts, failures: [] })).toBe(
      '2 of the 15 dropped songs would replace songs with the same file names:'
    )
  })
})

describe('listTakenNames', () => {
  it('lists each taken name once, even when two dropped songs share it', () => {
    expect(listTakenNames(['More.mp3', 'Bad Seed.mp3', 'More.mp3'])).toEqual({
      listedNames: ['More.mp3', 'Bad Seed.mp3'],
      unlistedCount: 0
    })
  })

  it('lists the first names only, counting the others', () => {
    const conflicts = [
      'Deer Dance.mp3',
      'Soldier Side.mp3',
      'Sprouts of Time.mp3',
      'Somedays.mp3',
      'The Rage of the Waters.mp3',
      'Metal Icarus.mp3',
      'Bad Seed.mp3'
    ]

    expect(listTakenNames(conflicts)).toEqual({
      listedNames: conflicts.slice(0, MAX_LISTED_TAKEN_NAMES),
      unlistedCount: conflicts.length - MAX_LISTED_TAKEN_NAMES
    })
  })
})
