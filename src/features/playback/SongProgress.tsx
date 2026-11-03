import { Button } from '@headlessui/react'
import { FOCUS_CLASSES } from '../../components/buttonStyles'
import { type ShownTime, usePlaybackStore } from './playbackStore'
import {
  formatCountdown,
  formatPlaybackTime,
  progressFraction,
  remainingSeconds
} from './playbackTime'

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

const toPercentage = (fraction: number) => `${fraction * 100}%`

/**
 * The middle of the audio player: a bar that fills as the song plays, with the elapsed time on its
 * left and the remaining time on its right, both as `mm:ss`. Clicking the left time switches it to
 * the time left, counted down as `-mm:ss`, and back. Until the song's length is known, the bar
 * stays empty and the remaining time shows dashes.
 *
 * @summary Progress bar of the playing song, with its times
 */
export const SongProgress = ({ elapsedSeconds, durationSeconds }: SongProgressProps) => {
  const shownTime = usePlaybackStore(state => state.shownTime)
  const toggleShownTime = usePlaybackStore(state => state.toggleShownTime)
  const timeLeft = remainingSeconds(elapsedSeconds, durationSeconds)
  const isLengthKnown = durationSeconds !== null
  const leftTime =
    shownTime === 'elapsed' ? formatPlaybackTime(elapsedSeconds) : formatCountdown(timeLeft)

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
      <div
        role="progressbar"
        aria-label="Song progress"
        aria-valuemin={0}
        aria-valuemax={isLengthKnown ? Math.floor(durationSeconds) : undefined}
        aria-valuenow={isLengthKnown ? Math.floor(elapsedSeconds) : undefined}
        aria-valuetext={
          isLengthKnown
            ? `${formatPlaybackTime(elapsedSeconds)} of ${formatPlaybackTime(durationSeconds)}`
            : undefined
        }
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-rule"
      >
        <div
          className="h-full rounded-full bg-pen"
          style={{ width: toPercentage(progressFraction(elapsedSeconds, durationSeconds)) }}
        />
      </div>
      <span className="w-14 shrink-0">
        <span className="sr-only">{SHOWN_TIME_NAMES.remaining} </span>
        {formatPlaybackTime(timeLeft)}
      </span>
    </div>
  )
}
