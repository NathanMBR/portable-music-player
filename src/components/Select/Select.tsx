import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid'
import { type RefObject, useRef } from 'react'
import { log } from '../../features/logging/log'
import { labelOf } from '../accessibleName'
import {
  FOCUS_CLASSES,
  POPUP_CLASSES,
  POPUP_OPTION_CLASSES,
  VARIANT_CLASSES
} from '../buttonStyles'
import { useOpenStateLog } from '../useOpenStateLog'

type SelectOption<Value extends string> = {
  /** What `onChange` gets when this option is chosen. */
  value: Value
  /** The option's visible text, in the list and on the closed select. */
  label: string
}

type SelectProps<Value extends string> = {
  /** The options, in the order they're listed. */
  options: readonly SelectOption<Value>[]
  /** The chosen option's value. */
  value: Value
  /** Runs with the value of the option chosen by a click or from the keyboard. */
  onChange: (value: Value) => void
}

type OpenStateLogProps = {
  isOpen: boolean
  buttonRef: RefObject<HTMLButtonElement | null>
}

// A component, since the list's open state only comes from Headless UI's render prop.
const OpenStateLog = ({ isOpen, buttonRef }: OpenStateLogProps) => {
  useOpenStateLog(isOpen, nowOpen => {
    if (buttonRef.current) {
      log(`${nowOpen ? 'Opened' : 'Closed'} selector "${labelOf(buttonRef.current)}"`)
    }
  })

  return null
}

/**
 * A choice of one option from a list that opens below it: closed, it's an outlined button showing
 * the chosen option, with up and down chevrons. Open, it lists every option on the paper, the
 * chosen one marked with a pen check, and closes once one is chosen. From the keyboard, the down
 * arrow opens it, the arrows move through it, Enter chooses and Escape closes. It draws its own
 * list, so the list follows the app's theme instead of the system's. A Headless UI `Label` in the
 * same `Field` names it. Its list opening, each option chosen and its list closing are logged
 * under that label.
 *
 * @summary Single choice from a dropdown list
 */
export const Select = <Value extends string>({ options, value, onChange }: SelectProps<Value>) => {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const labelOfValue = (optionValue: Value) =>
    options.find(option => option.value === optionValue)?.label

  // Chosen from the pointer or the keyboard alike.
  const choose = (chosenValue: Value) => {
    if (buttonRef.current) {
      log(`Selector "${labelOf(buttonRef.current)}" set value to "${labelOfValue(chosenValue)}"`)
    }
    onChange(chosenValue)
  }

  return (
    <Listbox value={value} onChange={choose}>
      {({ open }) => (
        <>
          <OpenStateLog isOpen={open} buttonRef={buttonRef} />
          <ListboxButton
            ref={buttonRef}
            className={`flex min-w-48 items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left ${VARIANT_CLASSES.outlined} ${FOCUS_CLASSES}`}
          >
            {labelOfValue(value)}
            <ChevronUpDownIcon className="size-5 text-ink-faded" />
          </ListboxButton>
          <ListboxOptions
            anchor={{ to: 'bottom end', gap: 4 }}
            className={`z-20 w-(--button-width) rounded-lg p-1 outline-none ${POPUP_CLASSES}`}
          >
            {options.map(option => (
              <ListboxOption
                key={option.value}
                value={option.value}
                className={`group flex items-center gap-2 rounded-md px-2 py-1.5 ${POPUP_OPTION_CLASSES}`}
              >
                <CheckIcon className="invisible size-4 text-pen group-data-selected:visible" />
                {option.label}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </>
      )}
    </Listbox>
  )
}
