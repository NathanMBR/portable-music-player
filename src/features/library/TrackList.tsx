import { PlayButton } from '../playback/PlayButton'
import type { Track } from './types'

type TrackListProps = {
  /** The songs to list, in the order given (the store keeps them sorted by title). */
  tracks: Track[]
}

/**
 * The songs of the library, one row each, starting with a round play button. Only one song plays
 * at a time. A title too long for its row is cut with an ellipsis, and hovering shows it whole.
 *
 * @summary List of songs
 */
export const TrackList = ({ tracks }: TrackListProps) => (
  <ul aria-label="Songs" className="pb-8">
    {tracks.map(track => (
      <li key={track.path} className="flex items-center gap-2 border-b border-rule py-1.5">
        <PlayButton track={track} />
        <span title={track.title} className="truncate font-stretch-semi-condensed">
          {track.title}
        </span>
      </li>
    ))}
  </ul>
)
