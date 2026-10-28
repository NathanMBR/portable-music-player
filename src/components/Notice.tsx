import type { ReactNode } from 'react'

type NoticeTone = 'neutral' | 'error'

type NoticeProps = {
  /** What happened, in a few words. */
  title: string
  /** What it means or what to do next. Error messages from Rust are shown here as they are. */
  description: string
  /** `error` paints the title in the `correction` color. */
  tone?: NoticeTone
  /** Optional call to action under the description, usually a `Button`. */
  action?: ReactNode
}

const titleColorByTone: Record<NoticeTone, string> = {
  neutral: 'text-ink',
  error: 'text-correction'
}

/**
 * Message shown in place of a view's content when there is nothing else to show, like an empty
 * Songs folder or a scan that failed.
 *
 * @summary Message that fills a view, with an optional action
 */
export const Notice = ({ title, description, tone = 'neutral', action }: NoticeProps) => (
  <section className="py-8">
    <h2 className={`text-base font-semibold ${titleColorByTone[tone]}`}>{title}</h2>
    <p className="mt-1 max-w-prose text-sm text-ink-faded">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </section>
)
