const SECONDS_PER_MINUTE = 60
const UNKNOWN_TIME = '--:--'

const padToTwoDigits = (value: number) => String(value).padStart(2, '0')

/** `mm:ss`, with minutes that keep counting past an hour, or dashes while the time is unknown. */
export const formatPlaybackTime = (seconds: number | null) => {
  if (seconds === null) return UNKNOWN_TIME

  const wholeSeconds = Math.floor(seconds)
  const minutes = Math.floor(wholeSeconds / SECONDS_PER_MINUTE)
  return `${padToTwoDigits(minutes)}:${padToTwoDigits(wholeSeconds % SECONDS_PER_MINUTE)}`
}

/** The time left counted down, as `-mm:ss`. */
export const formatCountdown = (seconds: number | null) =>
  seconds === null ? UNKNOWN_TIME : `-${formatPlaybackTime(seconds)}`

// Computed from whole seconds, so the elapsed and remaining times on screen add up to the length.
export const remainingSeconds = (elapsedSeconds: number, durationSeconds: number | null) =>
  durationSeconds === null
    ? null
    : Math.max(0, Math.floor(durationSeconds) - Math.floor(elapsedSeconds))

/** How much of the song has played, from 0 to 1: how far the progress bar is filled. */
export const progressFraction = (elapsedSeconds: number, durationSeconds: number | null) => {
  if (durationSeconds === null || durationSeconds <= 0) return 0
  return Math.min(1, Math.max(0, elapsedSeconds / durationSeconds))
}
