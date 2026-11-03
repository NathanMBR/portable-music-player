import { XMarkIcon } from '@heroicons/react/16/solid'
import { ExclamationCircleIcon, InformationCircleIcon } from '@heroicons/react/20/solid'
import { createPortal } from 'react-dom'
import { Toaster } from 'sonner'
import {
  DISMISS_LABEL,
  NARROW_WINDOW_EDGE_GAP,
  NOTIFICATION_DURATION_MS,
  WINDOW_EDGE_GAP
} from '../constants'

type NotificationAreaProps = {
  /**
   * Room to keep free at the bottom of the window, as a CSS length, so notifications pop up above
   * what sits there, like the audio player. None by default.
   */
  bottomClearance?: string
}

// Sonner's close button isn't a Headless UI one, so it takes hover: and focus-visible:, not data-*.
const CLASS_NAMES = {
  toast:
    'flex w-full items-start gap-3 rounded-lg border border-rule bg-paper py-3 pr-11 pl-4 text-ink shadow-lg shadow-shade/15',
  icon: 'mt-px shrink-0',
  content: 'min-w-0',
  title: 'text-sm font-semibold',
  description: 'mt-1 text-sm break-words text-ink-faded',
  closeButton:
    'absolute top-2.5 right-2.5 rounded-full p-1 text-ink-faded hover:bg-rule/60 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen'
}

const ICONS = {
  error: <ExclamationCircleIcon className="size-5 text-correction" />,
  info: <InformationCircleIcon className="size-5 text-pen" />,
  close: <XMarkIcon className="size-4" />
}

const offsetAbove = (bottomClearance: string | undefined, edgeGap: string) =>
  bottomClearance === undefined ? edgeGap : `calc(${bottomClearance} + ${edgeGap})`

/**
 * The bottom-right corner where notifications pop up, raised from anywhere with `notifyError` or
 * `notify` (`notify.ts`). Each one closes by itself after a few seconds, or earlier with its ×
 * button. Hovering the stack spreads it out and pauses the timers. The app shell renders it once,
 * raised above the audio player while the player is open.
 *
 * @summary Corner where notifications pop up
 */
export const NotificationArea = ({ bottomClearance }: NotificationAreaProps) => (
  // The fragment makes react-docgen see a component, so this JSDoc reaches the docs. The portal
  // renders straight into <body>: while the side menu is open, Headless UI marks the app's root
  // inert, which would make a notification raised from the menu unclickable and silent to screen
  // readers.
  <>
    {createPortal(
      <Toaster
        position="bottom-right"
        offset={{ bottom: offsetAbove(bottomClearance, WINDOW_EDGE_GAP) }}
        mobileOffset={{ bottom: offsetAbove(bottomClearance, NARROW_WINDOW_EDGE_GAP) }}
        duration={NOTIFICATION_DURATION_MS}
        closeButton
        icons={ICONS}
        toastOptions={{
          unstyled: true,
          classNames: CLASS_NAMES,
          closeButtonAriaLabel: DISMISS_LABEL
        }}
      />,
      document.body
    )}
  </>
)
