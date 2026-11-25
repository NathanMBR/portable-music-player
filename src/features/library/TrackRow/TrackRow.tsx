import { ListRow } from '../../../components/ListRow/ListRow'
import { PlayButton } from '../../playback/PlayButton/PlayButton'
import { SONGS_SOURCE } from '../../playback/playbackSource'
import { useIsInPlayerFrom } from '../../playback/useIsInPlayerFrom'
import { CoverThumbnail } from '../CoverThumbnail/CoverThumbnail'
import { TrackName } from '../TrackName/TrackName'
import type { Track } from '../types'

type TrackRowProps = {
  /** The song the row shows. */
  track: Track
  /** Plays the song the way its list does, like with the whole song list as the queue. */
  onPlay: () => void
}

/**
 * Row of one song of the Songs view: a round play button, a square miniature of the song's cover, read
 * once the row is on screen, or a photo icon when it has none, then the song's title and, when its
 * tags name one, a middle dot and the artist in a lighter ink. A name too long for the row is cut
 * with an ellipsis, and hovering shows it whole, as "Title · Artist". The row under the mouse is
 * tinted. The song in the player, playing or paused, played from the Songs view, has its row on a
 * pen tint with its title and artist in pen, and screen readers hear it as current: played from a
 * playlist, it looks like any other row. It goes in a `<ul>`.
 *
 * @summary Row of one song, with its play button and cover
 */
export const TrackRow = ({ track, onPlay }: TrackRowProps) => {
  const isInPlayer = useIsInPlayerFrom(track, SONGS_SOURCE)

  return (
    <ListRow isCurrent={isInPlayer}>
      <PlayButton track={track} source={SONGS_SOURCE} onPlay={onPlay} />
      <CoverThumbnail paths={[track.path]} />
      <TrackName track={track} isInPlayer={isInPlayer} />
    </ListRow>
  )
}
