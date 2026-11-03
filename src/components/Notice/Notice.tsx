import type { ReactNode } from 'react'

type NoticeProps = {
  /** What happened, in a few words. */
  title: string
  /** What it means or what to do next. */
  description: string
  /** Optional call to action under the description, usually a `Button`. */
  action?: ReactNode
}

/**
 * Message shown in place of a view's content when there is nothing else to show, like an empty
 * Songs folder or a scan that failed. It stays calm even for failures: the reason pops up as a
 * notification, and the notice says what to do next.
 *
 * @summary Message that fills a view, with an optional action
 */
export const Notice = ({ title, description, action }: NoticeProps) => (
  <section className="py-8">
    <h2 className="text-base font-semibold text-ink">{title}</h2>
    <p className="mt-1 max-w-prose text-sm text-ink-faded">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </section>
)
