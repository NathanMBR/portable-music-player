import { PauseIcon, PlayIcon } from '@heroicons/react/20/solid'
import { IconButton } from '../../components/IconButton'
import type { Track } from '../library/types'
import { usePlaybackStore } from './playbackStore'

type PlayButtonProps = {
  /** The song the button plays. */
  track: Track
}

/**
 * Round button at the start of a song's row. Clicking it puts the song in the playing state,
 * which switches the icon to pause and takes that state away from any other song. Clicking it
 * again stops the song. No audio plays yet: the button only changes the playing state.
 *
 * @summary Play and pause button of one song
 */
export const PlayButton = ({ track }: PlayButtonProps) => {
  const isPlaying = usePlaybackStore(state => state.playingTrackPath === track.path)
  const togglePlayback = usePlaybackStore(state => state.togglePlayback)

  return (
    <IconButton
      icon={isPlaying ? PauseIcon : PlayIcon}
      label={`${isPlaying ? 'Pause' : 'Play'} ${track.title}`}
      onClick={() => togglePlayback(track.path)}
    />
  )
}
