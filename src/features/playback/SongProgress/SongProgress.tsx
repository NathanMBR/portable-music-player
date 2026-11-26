import { Button } from '@headlessui/react'
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { FOCUS_CLASSES } from '../../../components/buttonStyles'
import { Slider } from '../../../components/Slider/Slider'
import { POSITION_STEP_SECONDS } from '../constants'
import { logJump } from '../playbackLog'
import { type ShownTime, usePlaybackStore } from '../playbackStore'
import {
  formatCountdown,
  formatPlaybackTime,
  formatTenthsTime,
  remainingSeconds
} from '../playbackTime'

type SongProgressProps = {
  /** The line above the bar, the song's name, which screen readers announce as it changes. */
  songName: ReactNode
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

// The bar moves in tenths of a second, but a press of an arrow key skips a few seconds, like in
// most players.
const ARROW_KEY_STEP_SECONDS = 5

type DigitInsets = { start: number; end: number }

const NO_INSETS: DigitInsets = { start: 0, end: 0 }

/**
 * How far in from the ends of the row the times' digits sit: their boxes keep one width, so the bar
 * never moves, and the digits sit at the boxes' inner edges, so their own width sets where they
 * start and end. Measured again whenever either time, or the row, changes width.
 */
const useDigitInsets = () => {
  const rowRef = useRef<HTMLDivElement>(null)
  const leftDigitsRef = useRef<HTMLSpanElement>(null)
  const lengthDigitsRef = useRef<HTMLSpanElement>(null)
  const [insets, setInsets] = useState(NO_INSETS)

  useLayoutEffect(() => {
    const [row, leftDigits, lengthDigits] = [rowRef, leftDigitsRef, lengthDigitsRef].map(
      ref => ref.current
    )
    if (!row || !leftDigits || !lengthDigits) {
      return
    }
    const measure = () => {
      const rowBox = row.getBoundingClientRect()
      setInsets({
        start: leftDigits.getBoundingClientRect().left - rowBox.left,
        end: rowBox.right - lengthDigits.getBoundingClientRect().right
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    for (const element of [row, leftDigits, lengthDigits]) {
      observer.observe(element)
    }
    return () => observer.disconnect()
  }, [])

  return { rowRef, leftDigitsRef, lengthDigitsRef, insets }
}

/**
 * The middle of the audio player: the song's name, then a bar that fills as the song plays, in
 * tenths of a second, with the elapsed time on its left and the song's length on its right, both
 * as `mm:ss`. The name's line runs from the start of the left time's digits to the end of the
 * length's, following the left time as it changes width. The bar is a
 * slider: clicking or dragging it jumps within the song, and so do the keyboard's arrows (5
 * seconds a press), Page Up and Down (a tenth of the song), Home and End. Clicking the left time
 * switches it to the time left, counted down as `-mm:ss`, and back. The mouse over the bar shows,
 * in a tooltip above it, the time a click there would jump to, to the tenth of a second. Until the
 * song's length is known, the bar stays empty and disabled, without the tooltip, and the length
 * shows dashes. Each jump on the bar is
 * logged once it ends, with where it lands to the millisecond.
 *
 * @summary Seekable progress bar of the playing song, with its times
 */
export const SongProgress = ({ songName, elapsedSeconds, durationSeconds }: SongProgressProps) => {
  const { rowRef, leftDigitsRef, lengthDigitsRef, insets } = useDigitInsets()
  const shownTime = usePlaybackStore(state => state.shownTime)
  const toggleShownTime = usePlaybackStore(state => state.toggleShownTime)
  const seek = usePlaybackStore(state => state.seek)
  const isLengthKnown = durationSeconds !== null
  const leftTime =
    shownTime === 'elapsed'
      ? formatPlaybackTime(elapsedSeconds)
      : formatCountdown(remainingSeconds(elapsedSeconds, durationSeconds))

  return (
    <>
      <p
        aria-live="polite"
        className="mb-1 font-semibold"
        style={{ marginLeft: insets.start, marginRight: insets.end }}
      >
        {songName}
      </p>
      <div ref={rowRef} className="flex items-center gap-3 text-sm text-ink-faded tabular-nums">
        <Button
          onClick={toggleShownTime}
          title={SWITCH_HINTS[shownTime]}
          className={`w-14 shrink-0 rounded text-right data-hover:text-ink ${FOCUS_CLASSES}`}
        >
          <span className="sr-only">{SHOWN_TIME_NAMES[shownTime]} </span>
          {/* A block, unlike text, reports its changes of width. */}
          <span ref={leftDigitsRef} className="inline-block">
            {leftTime}
          </span>
        </Button>
        <div className="min-w-0 flex-1">
          <Slider
            label="Song position"
            value={elapsedSeconds}
            max={durationSeconds ?? 0}
            step={POSITION_STEP_SECONDS}
            arrowKeyStep={ARROW_KEY_STEP_SECONDS}
            valueText={
              isLengthKnown
                ? `${formatPlaybackTime(elapsedSeconds)} of ${formatPlaybackTime(durationSeconds)}`
                : 'Length unknown'
            }
            isDisabled={!isLengthKnown}
            onChange={seek}
            onCommit={logJump}
            formatPointerValue={formatTenthsTime}
          />
        </div>
        <span className="w-14 shrink-0">
          <span className="sr-only">{SONG_LENGTH_NAME} </span>
          <span ref={lengthDigitsRef} className="inline-block">
            {formatPlaybackTime(durationSeconds)}
          </span>
        </span>
      </div>
    </>
  )
}
