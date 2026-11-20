import type { MouseEvent as ReactMouseEvent } from 'react'
import { type Action, type ToastT, type ToastToDismiss, toast } from 'sonner'

// getToasts() leaves dismissed notifications out, but its type still allows them.
const isShown = (notification: ToastT | ToastToDismiss): notification is ToastT =>
  !('dismiss' in notification)

// A notification's action is either Sonner's own button, described by an object, or an element.
const isAction = (action: ToastT['action']): action is Action =>
  typeof action === 'object' && action !== null && 'onClick' in action

const shownToasts = () => toast.getToasts().filter(isShown)

/**
 * The notifications on screen, reduced to what the user reads, so tests can compare them: the
 * label of their button, like Undo, is `action`.
 */
export const shownNotifications = () =>
  shownToasts().map(({ type, title, description, action }) => ({
    type,
    title,
    description,
    action: isAction(action) ? action.label : undefined
  }))

/** Clicks the button of the notification on screen with this title, like its Undo. */
export const clickNotificationAction = (title: string) => {
  const notification = shownToasts().find(shown => shown.title === title)
  const action = notification?.action
  if (!notification || !isAction(action)) {
    throw new Error(`No notification "${title}" with a button is on screen`)
  }
  // Sonner hands the click to the action, which the app's actions never read.
  action.onClick(new MouseEvent('click') as unknown as ReactMouseEvent<HTMLButtonElement>)
  toast.dismiss(notification.id)
}
