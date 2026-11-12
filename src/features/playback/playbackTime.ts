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

// From whole seconds, so the elapsed time and the countdown add up to the length on screen.
export const remainingSeconds = (elapsedSeconds: number, durationSeconds: number | null) =>
  durationSeconds === null
    ? null
    : Math.max(0, Math.floor(durationSeconds) - Math.floor(elapsedSeconds))
