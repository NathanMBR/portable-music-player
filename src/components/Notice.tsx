import type { ReactNode } from 'react'

type NoticeTone = 'neutral' | 'error'

type NoticeProps = {
  title: string
  description: string
  tone?: NoticeTone
  action?: ReactNode
}

const titleColorByTone: Record<NoticeTone, string> = {
  neutral: 'text-ink',
  error: 'text-correction'
}

export const Notice = ({ title, description, tone = 'neutral', action }: NoticeProps) => (
  <section className="py-8">
    <h2 className={`text-base font-semibold ${titleColorByTone[tone]}`}>{title}</h2>
    <p className="mt-1 max-w-prose text-sm text-ink-faded">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </section>
)
