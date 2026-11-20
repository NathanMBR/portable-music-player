import { ExclamationTriangleIcon } from '@heroicons/react/20/solid'

type AlertMarkProps = {
  /** What needs attention, in a few words: the accessible name and the hover tooltip. */
  label: string
  /** Larger, to follow a page's title in its header rather than a name in a row. */
  isLarge?: boolean
}

/**
 * Red alert icon right after a name, saying something about it needs attention, like a playlist
 * whose songs aren't all in the Songs folder. Its label is what screen readers hear, and what
 * shows when the mouse rests on it.
 *
 * @summary Red alert icon after a name that needs attention
 */
export const AlertMark = ({ label, isLarge = false }: AlertMarkProps) => (
  <span role="img" aria-label={label} title={label} className="inline-flex shrink-0">
    <ExclamationTriangleIcon className={`${isLarge ? 'size-7' : 'size-5'} text-correction`} />
  </span>
)
