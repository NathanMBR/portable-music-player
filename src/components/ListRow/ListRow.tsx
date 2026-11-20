import { DataInteractive } from '@headlessui/react'
import type { ReactNode } from 'react'
import { ACTIVE_CLASSES } from '../buttonStyles'

// The right padding matches an icon button's own, so a cut name ends as far from the edge of a
// highlighted row as a button's icon starts.
const ROW_CLASSES = 'flex items-center gap-2 border-b border-rule py-1.5 pr-2 first:border-t'

// Highlighted like the menu's categories: the current one is on, the others tint under the pointer.
const OTHER_ROW_CLASSES = 'data-hover:bg-rule/60'

type ListRowProps = {
  /** What the row shows, side by side, like a song's play button, cover and name. */
  children: ReactNode
  /** Makes it the current row, like the song in the player: on a pen tint, with its text in pen. */
  isCurrent?: boolean
}

/**
 * Row of a list between thin rules, from above the first row to below the last, like a song of
 * the song list or a playlist of the Playlists view. The row under the mouse is tinted. The
 * current row sits on a pen tint with its text in pen, and screen readers hear it as current. It
 * goes in a `<ul>`.
 *
 * @summary Row of a list, tinted under the mouse
 */
export const ListRow = ({ children, isCurrent = false }: ListRowProps) => (
  <DataInteractive
    as="li"
    aria-current={isCurrent || undefined}
    className={`${ROW_CLASSES} ${isCurrent ? ACTIVE_CLASSES : OTHER_ROW_CLASSES}`}
  >
    {children}
  </DataInteractive>
)
