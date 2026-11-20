import type { Announcements, ScreenReaderInstructions } from '@dnd-kit/core'

/** What a screen reader says about a sortable row's Move handle, as its description. */
export const MOVE_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    'Press Space to pick it up, then the up and down arrows to move it. Press Space again to drop it, or Escape to put it back.'
}

/** Whether the row being dragged has passed over another row's place since it was picked up. */
export type DragProgress = { hasLeftItsPlace: boolean }

/**
 * What a screen reader hears as a row of a sortable list moves: where it was picked up, each place
 * it passes, and where it's dropped or put back, as positions counted from 1. Right after the pick
 * up, the row passes over its own place, which says nothing new, so only coming back to it later
 * is heard, kept in `progress` between the drag's steps.
 */
export const sortableAnnouncements = (
  ids: string[],
  nameOf: (id: string) => string,
  progress: DragProgress
): Announcements => {
  const positionOf = (id: string | number) =>
    `position ${ids.indexOf(String(id)) + 1} of ${ids.length}`
  const quotedName = (id: string | number) => `"${nameOf(String(id))}"`

  return {
    onDragStart: ({ active }) => {
      progress.hasLeftItsPlace = false
      return `Picked up ${quotedName(active.id)}, at ${positionOf(active.id)}.`
    },
    onDragOver: ({ active, over }) => {
      if (!over) {
        return undefined
      }
      if (over.id !== active.id) {
        progress.hasLeftItsPlace = true
        return `${quotedName(active.id)} is at ${positionOf(over.id)}.`
      }
      return progress.hasLeftItsPlace
        ? `${quotedName(active.id)} is back at ${positionOf(active.id)}.`
        : undefined
    },
    onDragEnd: ({ active, over }) =>
      `Dropped ${quotedName(active.id)} at ${positionOf(over?.id ?? active.id)}.`,
    onDragCancel: ({ active }) => `Put ${quotedName(active.id)} back at ${positionOf(active.id)}.`
  }
}
