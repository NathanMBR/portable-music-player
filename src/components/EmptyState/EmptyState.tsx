import type { ComponentType } from 'react'

type EmptyStateProps = {
  /** Heroicon above the title, standing for what the view lists. */
  icon: ComponentType<{ className?: string }>
  /** What's missing, in a few words: a heading. */
  title: string
  /** What to do about it, when there's something to do. */
  description?: string
}

/**
 * Shown in the middle of a view that has nothing to list, like an empty Songs folder: a large
 * faded icon above a large title and, when there's something to do, what to do about it. It fills the height its parent leaves
 * it, when that parent is a flex column, like a view's content. For a failure, a `Notice` says
 * what to do instead.
 *
 * @summary Centered message of a view with nothing to list
 */
export const EmptyState = ({ icon: Icon, title, description }: EmptyStateProps) => (
  <section className="flex flex-1 flex-col items-center justify-center py-8 text-center">
    <Icon className="size-16 text-ink-faded" />
    <h2 className="mt-4 text-2xl leading-tight font-extrabold tracking-tight text-ink font-stretch-expanded">
      {title}
    </h2>
    {description && <p className="mt-2 max-w-prose text-base text-ink-faded">{description}</p>}
  </section>
)
