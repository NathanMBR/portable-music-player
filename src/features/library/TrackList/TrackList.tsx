import { usePlaybackStore } from '../../playback/playbackStore'
import { TrackRow } from '../TrackRow/TrackRow'
import type { Track } from '../types'

type TrackListProps = {
  /** The songs to list, in the order given (the Songs view sorts them as the settings ask). */
  tracks: Track[]
}

/**
 * The songs of the library, one row each between thin rules, from above the first row to below
 * the last, each row starting with a round play button. Playing a song makes the whole list the
 * audio player's queue, and only one song plays at a time. Next comes a square miniature of the
 * song's cover, read once the row is on screen, or a photo icon when it has none. Then each row
 * shows the song's title and, when its tags name one, a middle dot and the artist in a lighter
 * ink. A row too long for its width is cut with an ellipsis, and hovering shows it whole,
 * as "Title · Artist". The row under the mouse is tinted. The song in the player, playing or
 * paused, has its row on a pen tint with its title and artist in pen, and screen readers hear it
 * as current.
 *
 * @summary List of songs
 */
export const TrackList = ({ tracks }: TrackListProps) => {
  const playTrack = usePlaybackStore(state => state.playTrack)

  return (
    <ul aria-label="Songs" className="pb-8">
      {tracks.map(track => (
        <TrackRow key={track.path} track={track} onPlay={() => playTrack(track, tracks)} />
      ))}
    </ul>
  )
}
