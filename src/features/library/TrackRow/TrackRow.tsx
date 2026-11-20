import { ListRow } from '../../../components/ListRow/ListRow'
import { PlayButton } from '../../playback/PlayButton/PlayButton'
import { usePlaybackStore } from '../../playback/playbackStore'
import { CoverThumbnail } from '../CoverThumbnail/CoverThumbnail'
import { fullTrackName, TITLE_ARTIST_SEPARATOR } from '../trackName'
import type { Track } from '../types'

// On the pen tint of the song in the player, the artist's faded ink falls below a readable
// contrast, so the artist takes the row's pen there.
const artistClassesFor = (isInPlayer: boolean) => (isInPlayer ? undefined : 'text-ink-faded')

type TrackRowProps = {
  /** The song the row shows. */
  track: Track
  /** Plays the song the way its list does, like with the whole song list as the queue. */
  onPlay: () => void
  /** Fades the play button and ignores its clicks, like in a playlist whose songs aren't found. */
  isPlayDisabled?: boolean
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
export const TrackRow = ({ track, onPlay, isPlayDisabled }: TrackRowProps) => {
  const isInPlayer = usePlaybackStore(state => state.session?.track.path === track.path)

  return (
    <ListRow isCurrent={isInPlayer}>
      <PlayButton track={track} onPlay={onPlay} isDisabled={isPlayDisabled} />
      <CoverThumbnail path={track.path} />
      <span title={fullTrackName(track)} className="truncate font-stretch-semi-condensed">
        {track.title}
        {track.artist && (
          <span className={artistClassesFor(isInPlayer)}>
            {TITLE_ARTIST_SEPARATOR}
            {track.artist}
          </span>
        )}
      </span>
    </ListRow>
  )
}
