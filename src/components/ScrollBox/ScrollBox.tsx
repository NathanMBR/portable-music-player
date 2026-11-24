import { DataInteractive } from '@headlessui/react'
import type { ReactNode } from 'react'

type ScrollBoxProps = {
  /** What the box holds, which names it for screen readers, like "Songs with the same name". */
  label: string
  /** `ul` for a list of `li`s, like taken file names; `div`, a region, for anything else. */
  as?: 'ul' | 'div'
  /** What the box holds. */
  children: ReactNode
}

// The box keeps the scrollbar off its border: as far from its top as from its bottom, so the
// scrollbar's usual space at the bottom is dropped, and a little from its right side.
const BOX_CLASSES = 'mt-3 rounded-md border border-rule py-2 pr-1'

// The content has the focus, but the ring goes around the box, like FOCUS_CLASSES' ring. Only the
// content itself rings the box: a control inside it, like a link, rings only itself.
const BOX_FOCUS_CLASSES =
  'has-[>[data-focus]]:outline-2 has-[>[data-focus]]:outline-solid has-[>[data-focus]]:outline-offset-2 has-[>[data-focus]]:outline-pen'

// Room for six lines and part of a seventh, so longer content shows it scrolls, even in a small
// window.
const CONTENT_CLASSES =
  'max-h-40 overflow-y-auto px-3 text-sm text-ink outline-none [&::-webkit-scrollbar-track]:mb-0'

/**
 * A bordered box in a dialog whose content scrolls past six lines, like the songs a drop would
 * replace or an update's patch notes. Its scrollbar stays off the border. The content takes the
 * focus, since WebKitGTK scrolls a box from the keyboard only while it has the focus, and the
 * focus ring goes around the whole box. It holds a list, or anything else as a region, named by
 * its label.
 *
 * @summary Bordered box whose content scrolls
 */
export const ScrollBox = ({ label, as = 'div', children }: ScrollBoxProps) => (
  <div className={`${BOX_CLASSES} ${BOX_FOCUS_CLASSES}`}>
    <DataInteractive
      as={as}
      role={as === 'div' ? 'region' : undefined}
      aria-label={label}
      tabIndex={0}
      className={CONTENT_CLASSES}
    >
      {children}
    </DataInteractive>
  </div>
)
