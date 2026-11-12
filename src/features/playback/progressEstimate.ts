/** A position in the song, and the moment it held, in `performance.now()` milliseconds. */
export type TimedPosition = { seconds: number; atMs: number }

/** What the progress between two of the audio's reports is estimated from. */
export type ProgressClock = {
  /** The position the progress runs on from. */
  anchor: TimedPosition
  /** The position the audio last reported. */
  reportedSeconds: number
  /** The song's length, `null` while it's unknown. */
  durationSeconds: number | null
}

// On Linux the audio's clock was seen holding still for up to 9 s, then catching up, while the
// song played on. Further ahead of it than this, the audio itself must have stopped.
const MAX_LEAD_SECONDS = 10

const MS_PER_SECOND = 1000

const runOn = (anchor: TimedPosition, atMs: number) =>
  anchor.seconds + (atMs - anchor.atMs) / MS_PER_SECOND

/**
 * The progress to show at `atMs`: the anchor run on with the clock, but no further than
 * `MAX_LEAD_SECONDS` past the audio's last report, nor past the song's end.
 */
export const estimateProgress = (
  { anchor, reportedSeconds, durationSeconds }: ProgressClock,
  atMs: number
) =>
  Math.min(
    runOn(anchor, atMs),
    reportedSeconds + MAX_LEAD_SECONDS,
    durationSeconds ?? Number.POSITIVE_INFINITY
  )

/**
 * Where the progress runs on from once the audio reports `report`. That's the report itself when
 * it's ahead of the progress, or so far behind it that the audio must have stopped. While the
 * audio's clock is only catching up, the progress keeps running from where it was.
 */
export const anchorAfterReport = (anchor: TimedPosition | null, report: TimedPosition) => {
  if (!anchor) return report
  const lead = runOn(anchor, report.atMs) - report.seconds
  return lead <= 0 || lead > MAX_LEAD_SECONDS ? report : anchor
}
