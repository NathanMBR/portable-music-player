import { Button } from '@headlessui/react'
import { FOCUS_CLASSES } from '../../../components/buttonStyles'
import { Slider } from '../../../components/Slider/Slider'
import { type ShownTime, usePlaybackStore } from '../playbackStore'
import { formatCountdown, formatPlaybackTime, remainingSeconds } from '../playbackTime'

type SongProgressProps = {
  /** How far into the song playback is. */
  elapsedSeconds: number
  /** The song's length, `null` until its audio is loaded. */
  durationSeconds: number | null
}

const SHOWN_TIME_NAMES: Record<ShownTime, string> = {
  elapsed: 'Elapsed time',
  remaining: 'Remaining time'
}

const SWITCH_HINTS: Record<ShownTime, string> = {
  elapsed: 'Show remaining time',
  remaining: 'Show elapsed time'
}

const SONG_LENGTH_NAME = 'Song length'

/**
 * The middle of the audio player: a bar that fills as the song plays, with the elapsed time on its
 * left and the song's length on its right, both as `mm:ss`. The bar is a slider: clicking or
 * dragging it jumps within the song, and so do the arrow keys, Page Up and Down, Home and End.
 * Clicking the left time switches it to the time left, counted down as `-mm:ss`, and back. Until
 * the song's length is known, the bar stays empty and disabled, and the length shows dashes.
 *
 * @summary Seekable progress bar of the playing song, with its times
 */
export const SongProgress = ({ elapsedSeconds, durationSeconds }: SongProgressProps) => {
  const shownTime = usePlaybackStore(state => state.shownTime)
  const toggleShownTime = usePlaybackStore(state => state.toggleShownTime)
  const seek = usePlaybackStore(state => state.seek)
  const isLengthKnown = durationSeconds !== null
  const leftTime =
    shownTime === 'elapsed'
      ? formatPlaybackTime(elapsedSeconds)
      : formatCountdown(remainingSeconds(elapsedSeconds, durationSeconds))

  return (
    <div className="flex items-center gap-3 text-sm text-ink-faded tabular-nums">
      <Button
        onClick={toggleShownTime}
        title={SWITCH_HINTS[shownTime]}
        className={`w-14 shrink-0 rounded text-right data-hover:text-ink ${FOCUS_CLASSES}`}
      >
        <span className="sr-only">{SHOWN_TIME_NAMES[shownTime]} </span>
        {leftTime}
      </Button>
      <div className="min-w-0 flex-1">
        <Slider
          label="Song position"
          value={elapsedSeconds}
          max={durationSeconds ?? 0}
          valueText={
            isLengthKnown
              ? `${formatPlaybackTime(elapsedSeconds)} of ${formatPlaybackTime(durationSeconds)}`
              : 'Length unknown'
          }
          isDisabled={!isLengthKnown}
          onChange={seek}
        />
      </div>
      <span className="w-14 shrink-0">
        <span className="sr-only">{SONG_LENGTH_NAME} </span>
        {formatPlaybackTime(durationSeconds)}
      </span>
    </div>
  )
}
