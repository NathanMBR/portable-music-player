import { ListRow } from '../../../components/ListRow/ListRow'
import { PlayButton } from '../../playback/PlayButton/PlayButton'
import { usePlaybackStore } from '../../playback/playbackStore'
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
 * Row of one song in a list: a round play button, a square miniature of the song's cover, read
 * once the row is on screen, or a photo icon when it has none, then the song's title and, when its
 * tags name one, a middle dot and the artist in a lighter ink. A name too long for the row is cut
 * with an ellipsis, and hovering shows it whole, as "Title · Artist". The row under the mouse is
 * tinted. The song in the player, playing or paused, has its row on a pen tint with its title and
 * artist in pen, and screen readers hear it as current. It goes in a `<ul>`.
 *
 * @summary Row of one song, with its play button and cover
 */
export const TrackRow = ({ track, onPlay }: TrackRowProps) => {
  const isInPlayer = usePlaybackStore(state => state.session?.track.path === track.path)

  return (
    <ListRow isCurrent={isInPlayer}>
      <PlayButton track={track} onPlay={onPlay} />
      <CoverThumbnail path={track.path} />
      <TrackName track={track} isInPlayer={isInPlayer} />
    </ListRow>
  )
}
