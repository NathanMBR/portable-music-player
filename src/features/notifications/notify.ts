import { toast } from 'sonner'
import { UNDO_LABEL } from './constants'

// The only module that calls Sonner, like *Api.ts is the only one calling invoke(). Notifications
// are keyed by their title, so the same one raised again (e.g. a failing button clicked twice)
// replaces the one on screen instead of stacking a copy.

/** Pops up a message that isn't an error in the bottom-right corner. */
export const notify = (title: string, description?: string) => {
  toast.info(title, { id: title, description })
}

/** Pops up a message saying something went well, like a rescan of the Songs folder. */
export const notifySuccess = (title: string, description?: string) => {
  toast.success(title, { id: title, description })
}

/** Pops up a failure in the bottom-right corner: `title` says what failed, `error` says why. */
export const notifyError = (title: string, error: unknown) => {
  // Rust errors reach the frontend as their message string.
  toast.error(title, { id: title, description: String(error) })
}

/**
 * Pops up what was just done, like a deleted playlist, with an Undo button that takes it back. The
 * notification closes when Undo is clicked.
 */
export const notifyUndoable = (title: string, undo: () => void) => {
  toast.info(title, { id: title, action: { label: UNDO_LABEL, onClick: undo } })
}
