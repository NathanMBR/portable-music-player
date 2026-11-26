import { log } from '../logging/log'
import { formatPreciseTime } from './playbackTime'

/** Logs a jump in the song, where it lands: from the progress bar or the arrow keys alike. */
export const logJump = (seconds: number) => log(`Jumping song to ${formatPreciseTime(seconds)}`)

/** Logs the volume chosen, in percent: from the volume slider or the arrow keys alike. */
export const logVolume = (percent: number) => log(`Set volume to ${percent}%`)
