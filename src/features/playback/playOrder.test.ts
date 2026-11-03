import { describe, expect, it } from 'vitest'
import type { Track } from '../library/types'
import {
  createPlayOrder,
  findNextTrack,
  findPreviousTrack,
  nextRepeatMode,
  type RepeatMode,
  shuffle
} from './playOrder'

const trackTitled = (title: string): Track => ({ path: `Songs/${title}.mp3`, title })

const firstTrack = trackTitled('The Temple of Hate')
const secondTrack = trackTitled('Judgement Day')
const thirdTrack = trackTitled('Deus Le Volt!')
const fourthTrack = trackTitled('Lasting Child')
const queue = [firstTrack, secondTrack, thirdTrack, fourthTrack]

const REPEAT_ON: RepeatMode[] = ['all', 'one']

// A random number generator that always answers 0, so the shuffled order is known in advance.
const alwaysZero = () => 0

const sortedTitles = (tracks: Track[]) => tracks.map(track => track.title).sort()

describe('nextRepeatMode', () => {
  it('cycles from off to all to one, then back to off', () => {
    expect(nextRepeatMode('off')).toBe('all')
    expect(nextRepeatMode('all')).toBe('one')
    expect(nextRepeatMode('one')).toBe('off')
  })
})

describe('shuffle', () => {
  it('keeps every song exactly once', () => {
    expect(sortedTitles(shuffle(queue))).toEqual(sortedTitles(queue))
  })

  it('orders the songs by the random numbers it is given', () => {
    expect(shuffle(queue, alwaysZero)).toEqual([secondTrack, thirdTrack, fourthTrack, firstTrack])
  })

  it('leaves the given list untouched', () => {
    shuffle(queue, alwaysZero)
    expect(queue).toEqual([firstTrack, secondTrack, thirdTrack, fourthTrack])
  })
})

describe('createPlayOrder', () => {
  it('keeps the order of the list when shuffle is off', () => {
    expect(createPlayOrder(queue, thirdTrack, false)).toEqual(queue)
  })

  it('starts a shuffled order with the chosen song, followed by every other song', () => {
    expect(createPlayOrder(queue, thirdTrack, true, alwaysZero)).toEqual([
      thirdTrack,
      secondTrack,
      fourthTrack,
      firstTrack
    ])
  })
})

describe('findNextTrack', () => {
  it('finds the song after the current one', () => {
    expect(findNextTrack(queue, secondTrack, 'off')).toBe(thirdTrack)
  })

  it('finds none after the last song without repeat', () => {
    expect(findNextTrack(queue, fourthTrack, 'off')).toBeNull()
  })

  it('wraps around to the first song with repeat on', () => {
    for (const repeatMode of REPEAT_ON) {
      expect(findNextTrack(queue, fourthTrack, repeatMode)).toBe(firstTrack)
    }
  })

  it('finds the only song again with repeat on, and none without', () => {
    expect(findNextTrack([firstTrack], firstTrack, 'all')).toBe(firstTrack)
    expect(findNextTrack([firstTrack], firstTrack, 'off')).toBeNull()
  })
})

describe('findPreviousTrack', () => {
  it('finds the song before the current one', () => {
    expect(findPreviousTrack(queue, thirdTrack, 'off')).toBe(secondTrack)
  })

  it('finds none before the first song without repeat', () => {
    expect(findPreviousTrack(queue, firstTrack, 'off')).toBeNull()
  })

  it('wraps around to the last song with repeat on', () => {
    for (const repeatMode of REPEAT_ON) {
      expect(findPreviousTrack(queue, firstTrack, repeatMode)).toBe(fourthTrack)
    }
  })
})
