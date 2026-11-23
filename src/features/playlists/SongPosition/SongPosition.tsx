type SongPositionProps = {
  /** The song's place in the playlist, from 1. */
  position: number
  /** How many songs the playlist holds, whose longest position sets the width. */
  songCount: number
}

/**
 * A song's position in its playlist, from 1, in a lighter ink at the start of its row. It's as wide
 * as the playlist's longest position, right-aligned, so what follows it lines up on every row.
 * Screen readers don't hear it: the list or the option it sits in names the position itself.
 *
 * @summary A song's position in its playlist
 */
export const SongPosition = ({ position, songCount }: SongPositionProps) => (
  <span
    aria-hidden="true"
    style={{ width: `${String(songCount).length}ch` }}
    className="shrink-0 text-right text-sm text-ink-faded tabular-nums"
  >
    {position}
  </span>
)
