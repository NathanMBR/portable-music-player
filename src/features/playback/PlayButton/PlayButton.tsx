import { PauseIcon, PlayIcon } from '@heroicons/react/20/solid'
import { IconButton } from '../../../components/IconButton/IconButton'
import type { Track } from '../../library/types'
import type { PlaybackSource } from '../playbackSource'
import { usePlaybackStore } from '../playbackStore'
import { useIsInPlayerFrom } from '../useIsInPlayerFrom'

type PlayButtonProps = {
  /** The song the button plays. */
  track: Track
  /** The list the button is in: only the song in the player played from there shows as playing. */
  source: PlaybackSource
  /**
   * Plays the song while another one, none, or the same one from another list is in the player,
   * the way its list does: the song list plays it with the whole list as the queue, a playlist
   * with its own songs.
   */
  onPlay: () => void
  /** Fades the button and ignores clicks, like in a playlist whose songs aren't all found. */
  isDisabled?: boolean
}

/**
 * Round button at the start of a song's row. Clicking it plays the song in the audio player, the
 * way its list says, and switches the icon to pause, taking it away from any other song. Clicking
 * it again pauses the song, and once more resumes it. A song in the player played from another
 * list, like a playlist holding it, doesn't show as playing here: clicking plays it from this list.
 *
 * @summary Play and pause button of one song
 */
export const PlayButton = ({ track, source, onPlay, isDisabled }: PlayButtonProps) => {
  const isCurrent = useIsInPlayerFrom(track, source)
  const isPlaying = usePlaybackStore(state => state.session?.isPlaying === true) && isCurrent
  const togglePlaying = usePlaybackStore(state => state.togglePlaying)

  return (
    <IconButton
      icon={isPlaying ? PauseIcon : PlayIcon}
      label={`${isPlaying ? 'Pause' : 'Play'} ${track.title}`}
      isPressed={isPlaying}
      isDisabled={isDisabled}
      onClick={isCurrent ? togglePlaying : onPlay}
    />
  )
}
