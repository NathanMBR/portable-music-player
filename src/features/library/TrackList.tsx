import type { Track } from './types'

type TrackListProps = {
  /** The songs to list, in the order given (the store keeps them sorted by title). */
  tracks: Track[]
}

/**
 * The songs of the library, one row each. A title too long for its row is cut with an ellipsis,
 * and hovering shows it whole.
 *
 * @summary List of songs
 */
export const TrackList = ({ tracks }: TrackListProps) => (
  <ul aria-label="Songs" className="pb-8">
    {tracks.map(track => (
      <li
        key={track.path}
        title={track.title}
        className="truncate border-b border-rule py-3 font-stretch-semi-condensed"
      >
        {track.title}
      </li>
    ))}
  </ul>
)
