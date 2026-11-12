import { PlayButton } from '../../playback/PlayButton/PlayButton'
import { fullTrackName, TITLE_ARTIST_SEPARATOR } from '../trackName'
import type { Track } from '../types'

type TrackListProps = {
  /** The songs to list, in the order given (the store keeps them sorted by title). */
  tracks: Track[]
}

/**
 * The songs of the library, one row each, starting with a round play button. Playing a song makes
 * the whole list the audio player's queue, and only one song plays at a time. Each row shows the
 * song's title, then, when its tags name one, a middle dot and the artist in a lighter ink. A row
 * too long for its width is cut with an ellipsis, and hovering shows it whole, as "Title · Artist".
 *
 * @summary List of songs
 */
export const TrackList = ({ tracks }: TrackListProps) => (
  <ul aria-label="Songs" className="pb-8">
    {tracks.map(track => (
      <li key={track.path} className="flex items-center gap-2 border-b border-rule py-1.5">
        <PlayButton track={track} queue={tracks} />
        <span title={fullTrackName(track)} className="truncate font-stretch-semi-condensed">
          {track.title}
          {track.artist && (
            <span className="text-ink-faded">
              {TITLE_ARTIST_SEPARATOR}
              {track.artist}
            </span>
          )}
        </span>
      </li>
    ))}
  </ul>
)
