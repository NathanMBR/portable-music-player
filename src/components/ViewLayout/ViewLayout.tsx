import type { ReactNode } from 'react'

type ViewLayoutProps = {
  /** Stays in place at the top, usually a `ViewHeader`. */
  header: ReactNode
  /** What scrolls below the header. */
  children: ReactNode
}

// The content keeps the width between the gutters, like the header. Its scroll area stops inside
// the right gutter, so its scrollbar sits there, a small gap away from the content. The scrollbar
// is always there, only hidden while the content fits, so the content never widens: WebKitGTK
// ignores scrollbar-gutter, which would keep its room otherwise.
const CONTENT_COLUMN_CLASSES =
  'overflow-y-scroll pl-gutter pr-3 mr-[calc(var(--spacing-gutter)_-_var(--spacing-scrollbar)_-_var(--spacing)_*_3)]'

/**
 * The frame every category view shares, filling the height it's given: its header stays in place
 * and only the content below it scrolls, with the scrollbar beside it in the right margin. Both keep
 * equal side margins (the `gutter` token), so nothing sits under the menu button. Content tall
 * enough to scroll must hold focusable controls, like the song list's play buttons, so the keyboard
 * reaches all of it: the scroll area itself takes no focus.
 *
 * @summary Category view frame with a fixed header and scrolling content
 */
export const ViewLayout = ({ header, children }: ViewLayoutProps) => (
  <div className="flex h-full flex-col">
    <div className="px-gutter">{header}</div>
    <main className={`min-h-0 flex-1 ${CONTENT_COLUMN_CLASSES}`}>{children}</main>
  </div>
)
