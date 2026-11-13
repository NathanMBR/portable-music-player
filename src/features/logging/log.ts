import { notifyError } from '../notifications/notify'
import { writeLog } from './logsApi'

const WRITE_FAILURE_TITLE = "Couldn't write to the log"

/**
 * Adds a line to the app's log, which Rust prints to stdout and saves in the Logs folder, without
 * waiting for it: whatever is logged goes on at once.
 */
export const log = (message: string) => {
  writeLog(message).catch((error: unknown) => notifyError(WRITE_FAILURE_TITLE, error))
}
