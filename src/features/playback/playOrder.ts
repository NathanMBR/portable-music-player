import type { Track } from '../library/types'

export type RepeatMode = 'off' | 'all' | 'one'

const REPEAT_MODE_AFTER: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' }

export const nextRepeatMode = (mode: RepeatMode) => REPEAT_MODE_AFTER[mode]

/** A Fisher–Yates shuffle of a copy of `items`. Tests pass their own `random` to know the order. */
export const shuffle = <Item>(items: Item[], random: () => number = Math.random) => {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1))
    // Both indexes are inside the list, so both items exist.
    const item = shuffled[index] as Item
    shuffled[index] = shuffled[swapIndex] as Item
    shuffled[swapIndex] = item
  }
  return shuffled
}

/** The order the songs of `queue` play in: the queue's own, or shuffled after `firstTrack`. */
export const createPlayOrder = (
  queue: Track[],
  firstTrack: Track,
  isShuffled: boolean,
  random: () => number = Math.random
) => {
  if (!isShuffled) return queue

  const otherTracks = queue.filter(track => track.path !== firstTrack.path)
  return [firstTrack, ...shuffle(otherTracks, random)]
}

type Step = 1 | -1

const findTrackOneStepAway = (
  playOrder: Track[],
  current: Track,
  step: Step,
  repeatMode: RepeatMode
) => {
  const index = playOrder.findIndex(track => track.path === current.path) + step
  const isPastAnEnd = index < 0 || index >= playOrder.length
  if (isPastAnEnd && repeatMode === 'off') return null

  const wrappedIndex = (index + playOrder.length) % playOrder.length
  return playOrder[wrappedIndex] ?? null
}

/**
 * The song after `current`, wrapping around to the first one with repeat on, or `null` past the
 * last one without repeat. Skipping by hand ignores repeat one, which only applies when a song ends.
 */
export const findNextTrack = (playOrder: Track[], current: Track, repeatMode: RepeatMode) =>
  findTrackOneStepAway(playOrder, current, 1, repeatMode)

/** The song before `current`, mirroring `findNextTrack`. */
export const findPreviousTrack = (playOrder: Track[], current: Track, repeatMode: RepeatMode) =>
  findTrackOneStepAway(playOrder, current, -1, repeatMode)

// Like most players, "Previous song" past a song's first seconds starts it over: going back to
// the start of the current song is wanted far more often than the song before it.
const RESTART_AFTER_SECONDS = 3

/** Whether "Previous song" starts the current song over instead of going to the one before. */
export const restartsOnPrevious = (elapsedSeconds: number) => elapsedSeconds > RESTART_AFTER_SECONDS
