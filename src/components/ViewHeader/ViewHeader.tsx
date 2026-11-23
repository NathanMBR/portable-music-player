import { ArrowLeftIcon } from '@heroicons/react/20/solid'
import type { ComponentType, ReactNode } from 'react'
import { IconButton } from '../IconButton/IconButton'

type BackButton = {
  /** Where it goes back to, like "Back to playlists": its accessible name and tooltip. */
  label: string
  onClick: () => void
}

type ViewHeaderProps = {
  /**
   * Heroicon before the title, the same as the view's entry in the side menu. A back button takes
   * its place when there is one.
   */
  icon: ComponentType<{ className?: string }>
  /** The view's name: its main heading. */
  title: string
  /** Controls at the right end of the title's line, like the Songs view's buttons. */
  actions?: ReactNode
  /**
   * A back button in the icon's place, for a page inside a category, like a playlist inside
   * Playlists.
   */
  back?: BackButton
}

/**
 * Header of a category view, above a thick ink rule: the view's icon and title in the page title's
 * type, with optional controls at the right end of the line, and nothing else, so every view's
 * header looks the same; anything more about the view goes below the rule, in its content. Its
 * title's line is as tall as the menu button beside it, so the two line up across their columns.
 * It stays in place while the view's content scrolls below it (see `ViewLayout`). A page inside a
 * category, like a playlist, has a back button in the icon's place. A title too long for its line
 * wraps.
 *
 * @summary Category view header
 */
export const ViewHeader = ({ icon: Icon, title, actions, back }: ViewHeaderProps) => (
  <header className="border-b-2 border-ink pt-8 pb-4">
    {/* min-h-10 matches the menu button's height, so the two line up across their columns. */}
    <div className="flex min-h-10 items-center gap-3">
      {back ? (
        <IconButton icon={ArrowLeftIcon} label={back.label} onClick={back.onClick} />
      ) : (
        <Icon className="size-8 shrink-0 text-ink" />
      )}
      <h1 className="min-w-0 flex-1 text-4xl leading-none font-extrabold tracking-tight wrap-break-word font-stretch-expanded">
        {title}
      </h1>
      {actions}
    </div>
  </header>
)
