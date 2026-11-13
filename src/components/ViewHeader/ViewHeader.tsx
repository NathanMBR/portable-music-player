import type { ComponentType, ReactNode } from 'react'

type ViewHeaderProps = {
  /** Heroicon before the title, the same as the view's entry in the side menu. */
  icon: ComponentType<{ className?: string }>
  /** The view's name: its main heading. */
  title: string
  /** Controls at the right end of the title's line, like the Songs view's buttons. */
  actions?: ReactNode
  /** What goes below the title's line, like the Songs view's status line. */
  children?: ReactNode
}

/**
 * Header of a category view, above a thick ink rule: the view's icon and title in the page title's
 * type, with optional controls at the right end of the line. Its title's line is as tall as the
 * menu button beside it, so the two line up across their columns. It stays in place while the
 * view's content scrolls below it (see `ViewLayout`).
 *
 * @summary Category view header
 */
export const ViewHeader = ({ icon: Icon, title, actions, children }: ViewHeaderProps) => (
  <header className="border-b-2 border-ink pt-8 pb-4">
    {/* min-h-10 matches the menu button's height, so the two line up across their columns. */}
    <div className="flex min-h-10 items-center gap-3">
      <Icon className="size-8 text-ink" />
      <h1 className="flex-1 text-4xl leading-none font-extrabold tracking-tight font-stretch-expanded">
        {title}
      </h1>
      {actions}
    </div>
    {children}
  </header>
)
