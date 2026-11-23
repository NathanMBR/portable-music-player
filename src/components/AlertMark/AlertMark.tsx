import { ExclamationTriangleIcon } from '@heroicons/react/20/solid'

type AlertMarkProps = {
  /** What needs attention, in a few words: the accessible name and the hover tooltip. */
  label: string
  /** Larger, in place of a page header's large button rather than a row's round one. */
  isLarge?: boolean
}

/**
 * Red alert icon saying something needs attention, in place of the button it keeps from acting,
 * like the play button of a playlist whose songs aren't all in the Songs folder, or of a song
 * missing from it. Its label is what screen readers hear, and what shows when the mouse rests on
 * it.
 *
 * @summary Red alert icon in place of a button that can't act
 */
export const AlertMark = ({ label, isLarge = false }: AlertMarkProps) => (
  <span role="img" aria-label={label} title={label} className="inline-flex shrink-0">
    <ExclamationTriangleIcon className={`${isLarge ? 'size-7' : 'size-5'} text-correction`} />
  </span>
)
