import { DataInteractive } from '@headlessui/react'
import { ACTIVE_CLASSES } from '../../../components/buttonStyles'
import { PlayButton } from '../../playback/PlayButton/PlayButton'
import { usePlaybackStore } from '../../playback/playbackStore'
import { CoverThumbnail } from '../CoverThumbnail/CoverThumbnail'
import { fullTrackName, TITLE_ARTIST_SEPARATOR } from '../trackName'
import type { Track } from '../types'

// The right padding matches the play button's own, so a cut title ends as far from the edge of a
// highlighted row as the button's icon starts.
const ROW_CLASSES = 'flex items-center gap-2 border-b border-rule py-1.5 pr-2 first:border-t'

// Highlighted like the menu's categories: the current one is on, the others tint under the pointer.
const SONG_IN_PLAYER_CLASSES = ACTIVE_CLASSES
const OTHER_SONG_CLASSES = 'data-hover:bg-rule/60'

// On the pen tint of the song in the player, the artist's faded ink falls below a readable
// contrast, so the artist takes the row's pen there.
const artistClassesFor = (isInPlayer: boolean) => (isInPlayer ? undefined : 'text-ink-faded')

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
  const pathInPlayer = usePlaybackStore(state => state.session?.track.path)

  return (
    <ul aria-label="Songs" className="pb-8">
      {tracks.map(track => {
        const isInPlayer = track.path === pathInPlayer
        return (
          <DataInteractive
            as="li"
            key={track.path}
            aria-current={isInPlayer || undefined}
            className={`${ROW_CLASSES} ${isInPlayer ? SONG_IN_PLAYER_CLASSES : OTHER_SONG_CLASSES}`}
          >
            <PlayButton track={track} queue={tracks} />
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
          </DataInteractive>
        )
      })}
    </ul>
  )
}
