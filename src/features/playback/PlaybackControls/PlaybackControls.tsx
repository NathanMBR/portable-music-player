import {
  ArrowPathRoundedSquareIcon,
  ArrowsRightLeftIcon,
  BackwardIcon,
  ForwardIcon,
  PauseIcon,
  PlayIcon,
  StopIcon
} from '@heroicons/react/20/solid'
import { IconButton } from '../../../components/IconButton/IconButton'
import { usePlaybackStore } from '../playbackStore'
import type { RepeatMode } from '../playOrder'

type PlaybackControlsProps = {
  /** Whether the song plays: the main button then pauses it, otherwise it plays it. */
  isPlaying: boolean
  /** `false` on the first song of the queue while repeat is off, which disables "Previous song". */
  hasPreviousSong: boolean
  /** `false` on the last song of the queue while repeat is off, which disables "Next song". */
  hasNextSong: boolean
}

const REPEAT_LABELS: Record<RepeatMode, string> = {
  off: 'Repeat off',
  all: 'Repeat all',
  one: 'Repeat one'
}

// The 1 is drawn by CSS rather than written as text: it's decorative like the icon, since the
// button's label already says "Repeat one".
const RepeatOneIcon = ({ className }: { className?: string }) => (
  <span className="relative block after:absolute after:-top-1.5 after:-right-1.5 after:text-[0.625rem] after:leading-none after:font-extrabold after:content-['1']">
    <ArrowPathRoundedSquareIcon className={className} />
  </span>
)

const ShuffleButton = () => {
  const isShuffled = usePlaybackStore(state => state.isShuffled)
  const toggleShuffle = usePlaybackStore(state => state.toggleShuffle)

  return (
    <IconButton
      icon={ArrowsRightLeftIcon}
      label="Shuffle"
      isPressed={isShuffled}
      onClick={toggleShuffle}
    />
  )
}

const RepeatButton = () => {
  const repeatMode = usePlaybackStore(state => state.repeatMode)
  const cycleRepeatMode = usePlaybackStore(state => state.cycleRepeatMode)

  return (
    <IconButton
      icon={repeatMode === 'one' ? RepeatOneIcon : ArrowPathRoundedSquareIcon}
      label={REPEAT_LABELS[repeatMode]}
      isPressed={repeatMode !== 'off'}
      onClick={cycleRepeatMode}
    />
  )
}

/**
 * The left end of the audio player: shuffle, previous song, play or pause, stop, next song and
 * repeat. Stop hides the player. Previous and next are disabled at the ends of the queue while
 * repeat is off. Repeat cycles from off to all to one, and repeat one adds a small 1 to its icon.
 *
 * @summary Transport buttons of the audio player
 */
export const PlaybackControls = ({
  isPlaying,
  hasPreviousSong,
  hasNextSong
}: PlaybackControlsProps) => {
  const togglePlaying = usePlaybackStore(state => state.togglePlaying)
  const stop = usePlaybackStore(state => state.stop)
  const playPrevious = usePlaybackStore(state => state.playPrevious)
  const playNext = usePlaybackStore(state => state.playNext)

  return (
    <div className="flex items-center gap-1">
      <ShuffleButton />
      <IconButton
        icon={BackwardIcon}
        label="Previous song"
        isDisabled={!hasPreviousSong}
        onClick={playPrevious}
      />
      <IconButton
        icon={isPlaying ? PauseIcon : PlayIcon}
        label={isPlaying ? 'Pause' : 'Play'}
        shape="disc"
        variant="filled"
        onClick={togglePlaying}
      />
      <IconButton icon={StopIcon} label="Stop" onClick={stop} />
      <IconButton
        icon={ForwardIcon}
        label="Next song"
        isDisabled={!hasNextSong}
        onClick={playNext}
      />
      <RepeatButton />
    </div>
  )
}
