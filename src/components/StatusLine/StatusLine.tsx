import type { ReactNode } from 'react'

type StatusLineProps = {
  /** What it says. Without it, the line takes no room. */
  children?: ReactNode
}

/**
 * Status line at the top of a view's content, below the header's rule, like the Songs view's
 * song count. Screen readers announce it as it changes, so it's always on the page, even while it
 * says nothing: it then takes no room. A line too long for the view wraps.
 *
 * @summary View status line, announced as it changes
 */
export const StatusLine = ({ children }: StatusLineProps) => (
  // Screen readers only announce changes to a live region that was already there.
  <p role="status" className="pt-3 pb-1.5 text-sm wrap-break-word text-ink-faded empty:p-0">
    {children}
  </p>
)
