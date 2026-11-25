import type { Cover } from './coverStore'

/**
 * The first of the songs, by their paths, that may still have a cover: the one whose cover a
 * thumbnail shows, or reads next, since every song before it is known to have none. `undefined`
 * once they all are, or without songs.
 */
export const firstSongThatMayHaveCover = (
  paths: readonly string[],
  covers: ReadonlyMap<string, Cover>
) => paths.find(path => covers.get(path)?.kind !== 'missing')
