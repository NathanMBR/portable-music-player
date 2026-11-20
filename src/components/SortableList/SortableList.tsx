import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  type Modifier,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DataInteractive } from '@headlessui/react'
import { ArrowsUpDownIcon } from '@heroicons/react/20/solid'
import { type ReactNode, useRef } from 'react'
import { FOCUS_CLASSES, VARIANT_CLASSES } from '../buttonStyles'
import { ListRow } from '../ListRow/ListRow'
import {
  type DragProgress,
  MOVE_INSTRUCTIONS,
  sortableAnnouncements
} from './sortableAnnouncements'

// A press that moves less than this is a click, not the start of a drag.
const DRAG_START_DISTANCE_PX = 4

// The list only reorders, so a dragged row never leaves its column.
const alongTheVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })

// The handle's geometry matches a round icon button's, so the row keeps its rhythm.
const HANDLE_CLASSES = `shrink-0 cursor-grab touch-none rounded-full p-2 data-active:cursor-grabbing ${VARIANT_CLASSES.quiet} ${FOCUS_CLASSES}`

type SortableListProps = {
  /** The list's accessible name, like "Songs of Road trip". */
  label: string
  /** The rows' ids, in their order: each `SortableRow` inside has one of them. */
  ids: string[]
  /** What screen readers call a row as it moves, like a song's title. */
  nameOf: (id: string) => string
  /** Runs when a row is dropped at another place, with its old and new positions from 0. */
  onMove: (from: number, to: number) => void
  /** One `SortableRow` per id, in the same order. */
  children: ReactNode
}

/**
 * List whose rows can be dragged to another place by their Move handle, with the pointer, or from
 * the keyboard: Space picks a row up, the up and down arrows move it, and Space drops it, or
 * Escape puts it back. The other rows slide to make room, and the dragged one stays in its column.
 * Screen readers hear how to move a row from its handle, then each place it passes. It works on
 * pointer events, which the webviews keep sending while Tauri takes the window's drag and drop.
 *
 * @summary List whose rows can be dragged to reorder them
 */
export const SortableList = ({ label, ids, nameOf, onMove, children }: SortableListProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_START_DISTANCE_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  // Kept apart from renders, which may come between the steps of a drag.
  const dragProgress = useRef<DragProgress>({ hasLeftItsPlace: false })

  const moveDroppedRow = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) {
      onMove(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[alongTheVerticalAxis]}
      onDragEnd={moveDroppedRow}
      accessibility={{
        announcements: sortableAnnouncements(ids, nameOf, dragProgress.current),
        screenReaderInstructions: MOVE_INSTRUCTIONS
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul aria-label={label}>{children}</ul>
      </SortableContext>
    </DndContext>
  )
}

type SortableRowProps = {
  /** The row's id among the list's `ids`. */
  id: string
  /** The Move handle's accessible name and hover tooltip, like "Move Road trip". */
  moveLabel: string
  /** Makes it the current row, like `ListRow`'s. */
  isCurrent?: boolean
  /** What the row shows after its Move handle. */
  children: ReactNode
}

/**
 * Row of a `SortableList`: a Move handle, then what the row shows. Dragging the handle moves the
 * row, lifted above the others; elsewhere the row works like a `ListRow`.
 *
 * @summary Row of a sortable list, with its Move handle
 */
export const SortableRow = ({ id, moveLabel, isCurrent, children }: SortableRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id })

  return (
    <ListRow
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      isCurrent={isCurrent}
      isLifted={isDragging}
    >
      {/* Not a <button>: dragging it does the work, and the log has the move rather than a click. */}
      <DataInteractive
        as="span"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={moveLabel}
        title={moveLabel}
        className={HANDLE_CLASSES}
      >
        <ArrowsUpDownIcon className="size-5" />
      </DataInteractive>
      {children}
    </ListRow>
  )
}
