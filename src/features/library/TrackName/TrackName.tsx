import { fullTrackName, TITLE_ARTIST_SEPARATOR } from '../trackName'
import type { Track } from '../types'

type TrackNameProps = {
  /** The song it names. */
  track: Track
  /**
   * On the pen tint of the song in the player, the artist takes the row's pen: its lighter ink
   * would fall below a readable contrast there.
   */
  isInPlayer?: boolean
}

/**
 * A song's title, then, when its tags name one, a middle dot and its artist in a lighter ink, on
 * one line of a song's row. A name too long for the row is cut with an ellipsis, and hovering
 * shows it whole, as "Title · Artist".
 *
 * @summary A song's title and artist on one line
 */
export const TrackName = ({ track, isInPlayer = false }: TrackNameProps) => (
  <span title={fullTrackName(track)} className="truncate font-stretch-semi-condensed">
    {track.title}
    {track.artist && (
      <span className={isInPlayer ? undefined : 'text-ink-faded'}>
        {TITLE_ARTIST_SEPARATOR}
        {track.artist}
      </span>
    )}
  </span>
)
