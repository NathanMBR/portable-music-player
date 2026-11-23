/** Where a song goes, next to the one it's placed by. */
export type Placement = 'before' | 'after'

/**
 * The index a song moves to, from the playlist's songs by file name, to sit right before or after
 * another: the `to` of a move that takes the song out first, then puts it back at that index. It's
 * the song's own index when it already sits there.
 */
export const placementIndex = (
  songs: string[],
  movingSong: string,
  referenceSong: string,
  placement: Placement
) => {
  const referenceIndex = songs.indexOf(referenceSong)
  // Once the moving song is out, every song after it moves up a place.
  const referenceIndexWithout =
    songs.indexOf(movingSong) < referenceIndex ? referenceIndex - 1 : referenceIndex
  return placement === 'before' ? referenceIndexWithout : referenceIndexWithout + 1
}
