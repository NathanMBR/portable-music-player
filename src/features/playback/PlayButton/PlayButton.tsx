import { PauseIcon, PlayIcon } from '@heroicons/react/20/solid'
import { IconButton } from '../../../components/IconButton/IconButton'
import type { Track } from '../../library/types'
import { usePlaybackStore } from '../playbackStore'

type PlayButtonProps = {
  /** The song the button plays. */
  track: Track
  /** The list the song is in, which the audio player plays it from: next and previous follow it. */
  queue: Track[]
}

/**
 * Round button at the start of a song's row. Clicking it plays the song in the audio player, with
 * the song's list as the queue, and switches the icon to pause, taking it away from any other
 * song. Clicking it again pauses the song, and once more resumes it. No audio plays yet: the button
 * only changes the playback state.
 *
 * @summary Play and pause button of one song
 */
export const PlayButton = ({ track, queue }: PlayButtonProps) => {
  const isCurrent = usePlaybackStore(state => state.session?.track.path === track.path)
  const isPlaying = usePlaybackStore(
    state => state.session?.track.path === track.path && state.session.isPlaying
  )
  const playTrack = usePlaybackStore(state => state.playTrack)
  const togglePlaying = usePlaybackStore(state => state.togglePlaying)

  return (
    <IconButton
      icon={isPlaying ? PauseIcon : PlayIcon}
      label={`${isPlaying ? 'Pause' : 'Play'} ${track.title}`}
      isPressed={isPlaying}
      onClick={() => (isCurrent ? togglePlaying() : playTrack(track, queue))}
    />
  )
}
