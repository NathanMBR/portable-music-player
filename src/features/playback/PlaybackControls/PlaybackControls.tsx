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
import {
  keysText,
  NEXT_SONG_NAME,
  PLAYER_KEYS,
  PREVIOUS_SONG_NAME,
  playButtonName,
  REPEAT_NAMES,
  SHUFFLE_NAME,
  STOP_NAME
} from '../playerControls'

type PlaybackControlsProps = {
  /** Whether the song plays: the main button then pauses it, otherwise it plays it. */
  isPlaying: boolean
  /**
   * `false` in the first 3 seconds of the first song of the queue while repeat is off, which
   * disables "Previous song". Past those seconds it starts the song over.
   */
  canGoBack: boolean
  /** `false` on the last song of the queue while repeat is off, which disables "Next song". */
  hasNextSong: boolean
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
      label={SHUFFLE_NAME}
      shortcut={keysText(PLAYER_KEYS.shuffle)}
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
      label={REPEAT_NAMES[repeatMode]}
      shortcut={keysText(PLAYER_KEYS.repeat)}
      isPressed={repeatMode !== 'off'}
      state={repeatMode}
      onClick={cycleRepeatMode}
    />
  )
}

/**
 * The left end of the audio player: shuffle, previous song, play or pause, stop, next song and
 * repeat. Stop hides the player. Past a song's first 3 seconds, previous starts it over instead.
 * Previous and next are disabled at the ends of the queue while repeat is off. Repeat cycles from
 * off to all to one, and repeat one adds a small 1 to its icon. Each button's tooltip names its
 * keyboard shortcut.
 *
 * @summary Transport buttons of the audio player
 */
export const PlaybackControls = ({ isPlaying, canGoBack, hasNextSong }: PlaybackControlsProps) => {
  const togglePlaying = usePlaybackStore(state => state.togglePlaying)
  const stop = usePlaybackStore(state => state.stop)
  const playPrevious = usePlaybackStore(state => state.playPrevious)
  const playNext = usePlaybackStore(state => state.playNext)

  return (
    <div className="flex items-center gap-1">
      <ShuffleButton />
      <IconButton
        icon={BackwardIcon}
        label={PREVIOUS_SONG_NAME}
        shortcut={keysText(PLAYER_KEYS.previousSong)}
        isDisabled={!canGoBack}
        onClick={playPrevious}
      />
      <IconButton
        icon={isPlaying ? PauseIcon : PlayIcon}
        label={playButtonName(isPlaying)}
        shortcut={keysText(PLAYER_KEYS.playOrPause)}
        shape="disc"
        variant="filled"
        onClick={togglePlaying}
      />
      <IconButton
        icon={StopIcon}
        label={STOP_NAME}
        shortcut={keysText(PLAYER_KEYS.stop)}
        onClick={stop}
      />
      <IconButton
        icon={ForwardIcon}
        label={NEXT_SONG_NAME}
        shortcut={keysText(PLAYER_KEYS.nextSong)}
        isDisabled={!hasNextSong}
        onClick={playNext}
      />
      <RepeatButton />
    </div>
  )
}
