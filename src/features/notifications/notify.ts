import { toast } from 'sonner'

// The only module that calls Sonner, like *Api.ts is the only one calling invoke(). Notifications
// are keyed by their title, so the same one raised again (e.g. a failing button clicked twice)
// replaces the one on screen instead of stacking a copy.

/** Pops up a message that isn't an error in the bottom-right corner. */
export const notify = (title: string, description?: string) => {
  toast.info(title, { id: title, description })
}

/** Pops up a failure in the bottom-right corner: `title` says what failed, `error` says why. */
export const notifyError = (title: string, error: unknown) => {
  // Rust errors reach the frontend as their message string.
  toast.error(title, { id: title, description: String(error) })
}
