import { type ToastT, type ToastToDismiss, toast } from 'sonner'

// getToasts() leaves dismissed notifications out, but its type still allows them.
const isShown = (notification: ToastT | ToastToDismiss): notification is ToastT =>
  !('dismiss' in notification)

/** The notifications on screen, reduced to what the user reads, so tests can compare them. */
export const shownNotifications = () =>
  toast
    .getToasts()
    .filter(isShown)
    .map(({ type, title, description }) => ({ type, title, description }))
