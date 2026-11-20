import { PauseIcon, PlayIcon } from '@heroicons/react/20/solid'
import { IconButton } from '../../../components/IconButton/IconButton'
import type { Track } from '../../library/types'
import { usePlaybackStore } from '../playbackStore'

type PlayButtonProps = {
  /** The song the button plays. */
  track: Track
  /**
   * Plays the song while another one, or none, is in the player, the way its list does: the song
   * list plays it with the whole list as the queue, a playlist with its own songs.
   */
  onPlay: () => void
  /** Fades the button and ignores clicks, like in a playlist whose songs aren't all found. */
  isDisabled?: boolean
}

/**
 * Round button at the start of a song's row. Clicking it plays the song in the audio player, the
 * way its list says, and switches the icon to pause, taking it away from any other song. Clicking
 * it again pauses the song, and once more resumes it.
 *
 * @summary Play and pause button of one song
 */
export const PlayButton = ({ track, onPlay, isDisabled }: PlayButtonProps) => {
  const isCurrent = usePlaybackStore(state => state.session?.track.path === track.path)
  const isPlaying = usePlaybackStore(
    state => state.session?.track.path === track.path && state.session.isPlaying
  )
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
