import { DataInteractive } from '@headlessui/react'
import type { CSSProperties, ReactNode, Ref } from 'react'
import { ACTIVE_CLASSES } from '../buttonStyles'

// The right padding matches an icon button's own, so a cut name ends as far from the edge of a
// highlighted row as a button's icon starts. A sortable row's slide, an inline transition, stops
// for users who prefer reduced motion.
const ROW_CLASSES =
  'flex items-center gap-2 border-b border-rule py-1.5 pr-2 first:border-t motion-reduce:transition-none!'

// Highlighted like the menu's categories: the current one is on, the others tint under the pointer.
const OTHER_ROW_CLASSES = 'data-hover:bg-rule/60'

// A lifted row passes over the others, so it hides them instead of letting them show through.
const LIFTED_ROW_CLASSES = 'relative z-10 bg-paper shadow-md shadow-shade/30'

type ListRowProps = {
  /** What the row shows, side by side, like a song's play button, cover and name. */
  children: ReactNode
  /** Makes it the current row, like the song in the player: on a pen tint, with its text in pen. */
  isCurrent?: boolean
  /** Lifts the row above the others with a shadow, like a row being dragged to another place. */
  isLifted?: boolean
  /** The row's element, for a sortable list to measure and move it. */
  ref?: Ref<HTMLLIElement>
  /** Where a sortable list moves the row while it slides, as a transform and its transition. */
  style?: CSSProperties
}

const rowLookOf = (isCurrent: boolean, isLifted: boolean) => {
  if (isLifted) {
    return LIFTED_ROW_CLASSES
  }
  return isCurrent ? ACTIVE_CLASSES : OTHER_ROW_CLASSES
}

/**
 * Row of a list between thin rules, from above the first row to below the last, like a song of
 * the song list or a playlist of the Playlists view. The row under the mouse is tinted. The
 * current row sits on a pen tint with its text in pen, and screen readers hear it as current. In
 * a sortable list, the row being dragged is lifted above the others. It goes in a `<ul>`.
 *
 * @summary Row of a list, tinted under the mouse
 */
export const ListRow = ({
  children,
  isCurrent = false,
  isLifted = false,
  ref,
  style
}: ListRowProps) => (
  <DataInteractive
    as="li"
    ref={ref}
    style={style}
    aria-current={isCurrent || undefined}
    className={`${ROW_CLASSES} ${rowLookOf(isCurrent, isLifted)}`}
  >
    {children}
  </DataInteractive>
)
