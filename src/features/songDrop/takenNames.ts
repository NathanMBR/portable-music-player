import { MAX_LISTED_TAKEN_NAMES } from './constants'
import type { DroppedSongs } from './types'

const whatTheyWouldReplace = (takenCount: number) =>
  takenCount === 1 ? 'a song with the same file name' : 'songs with the same file names'

/**
 * Says how many of the dropped songs would take the place of others, before their names are
 * listed: "1 of the 12 dropped songs would replace a song with the same file name:".
 */
export const summarizeTakenNames = ({ songCount, conflicts }: DroppedSongs) => {
  const takenCount = conflicts.length
  const replaced = whatTheyWouldReplace(takenCount)
  if (takenCount < songCount) {
    return `${takenCount.toLocaleString()} of the ${songCount.toLocaleString()} dropped songs would replace ${replaced}:`
  }
  if (songCount === 1) return `The dropped song would replace ${replaced}:`
  return `All ${songCount.toLocaleString()} dropped songs would replace ${replaced}:`
}

/**
 * The taken file names the dialog lists, each once even when two dropped songs share it, up to
 * `MAX_LISTED_TAKEN_NAMES`, and how many more there are.
 */
export const listTakenNames = (conflicts: string[]) => {
  const names = [...new Set(conflicts)]
  return {
    listedNames: names.slice(0, MAX_LISTED_TAKEN_NAMES),
    unlistedCount: Math.max(0, names.length - MAX_LISTED_TAKEN_NAMES)
  }
}
