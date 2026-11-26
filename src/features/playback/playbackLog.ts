import { log } from '../logging/log'
import { formatPreciseTime } from './playbackTime'

/** Logs a jump in the song, where it lands: from the progress bar or the arrow keys alike. */
export const logJump = (seconds: number) => log(`Jumping song to ${formatPreciseTime(seconds)}`)

/** Logs the volume chosen, in percent: from the volume slider or the arrow keys alike. */
export const logVolume = (percent: number) => log(`Set volume to ${percent}%`)

/**
 * Logs a press of the keys that stand for a player's button, like a click on it: by the button's
 * name when pressed, then the state the press leaves, for a button that has one.
 */
export const logShortcut = (keys: string, buttonName: string, state?: string) => {
  const stateText = state === undefined ? '' : ` State: "${state}"`
  log(`Pressed shortcut "${keys}" for "${buttonName}"${stateText}`)
}
