import { Checkbox as HeadlessCheckbox } from '@headlessui/react'
import { CheckIcon } from '@heroicons/react/16/solid'
import { type ReactNode, useRef } from 'react'
import { logToggle } from '../../features/logging/log'
import { accessibleNameOf } from '../accessibleName'

type CheckboxProps = {
  /** Whether the box is checked. */
  checked: boolean
  /** Runs with the new state when it's clicked, or toggled with Space. */
  onChange: (checked: boolean) => void
  /** What it's for, beside the box, like a song's cover and name: clicking it toggles the box. */
  children: ReactNode
}

// The ring goes around the box alone, like FOCUS_CLASSES' ring, for the keyboard only.
const BOX_FOCUS_CLASSES =
  'group-data-focus:outline-2 group-data-focus:outline-solid group-data-focus:outline-offset-2 group-data-focus:outline-pen'

/**
 * Checkbox with what it's for beside it, the whole of which is clickable, like a song in the New
 * playlist dialog. Unchecked, the box is an empty square in a faded border; checked, it's filled
 * with pen and a check mark. Space toggles it from the keyboard, which also shows the focus ring
 * around the box. What's beside the box is its accessible name. Each toggle is logged, with that
 * name and the new state.
 *
 * @summary Checkbox with what it's for beside it
 */
export const Checkbox = ({ checked, onChange, children }: CheckboxProps) => {
  const checkboxRef = useRef<HTMLDivElement>(null)

  // Logged here rather than from clicks, since Space toggles a checkbox without one.
  const toggle = (isChecked: boolean) => {
    if (checkboxRef.current) {
      logToggle(accessibleNameOf(checkboxRef.current), isChecked)
    }
    onChange(isChecked)
  }

  return (
    <HeadlessCheckbox
      as="div"
      ref={checkboxRef}
      checked={checked}
      onChange={toggle}
      className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 outline-none"
    >
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded border-2 border-ink-faded group-data-checked:border-pen group-data-checked:bg-pen ${BOX_FOCUS_CLASSES}`}
      >
        <CheckIcon
          aria-hidden="true"
          className="invisible size-4 text-paper group-data-checked:visible"
        />
      </span>
      {children}
    </HeadlessCheckbox>
  )
}
