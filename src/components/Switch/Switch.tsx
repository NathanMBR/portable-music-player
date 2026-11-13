import { Switch as HeadlessSwitch } from '@headlessui/react'
import { type ComponentType, useRef } from 'react'
import { log } from '../../features/logging/log'
import { accessibleNameOf } from '../accessibleName'
import { FOCUS_CLASSES } from '../buttonStyles'

type SwitchProps = {
  /** Whether the switch is on. */
  checked: boolean
  /** Runs with the new state when the switch is clicked or toggled from the keyboard. */
  onChange: (checked: boolean) => void
  /**
   * Accessible name and hover tooltip, for a switch with no visible label. Inside a Headless UI
   * `Field`, its `Label` names the switch instead.
   */
  label?: string
  /** Heroicon on the knob, from `@heroicons/react/16/solid`, like the theme toggle's sun and moon. */
  knobIcon?: ComponentType<{ className?: string }>
}

/**
 * On/off switch: a pill track, faded while off and pen while on, with a paper knob that slides to
 * the right when it turns on, optionally carrying an icon. Space or Enter toggles it from the
 * keyboard, which also shows the focus ring. Each toggle is logged, with the switch's name and
 * its new state.
 *
 * @summary On/off switch
 */
export const Switch = ({ checked, onChange, label, knobIcon: KnobIcon }: SwitchProps) => {
  const switchRef = useRef<HTMLButtonElement>(null)

  // Logged here rather than from clicks, since Space toggles a switch without one.
  const toggle = (isOn: boolean) => {
    if (switchRef.current) {
      log(`"${accessibleNameOf(switchRef.current)}" is ${isOn ? 'on' : 'off'}`)
    }
    onChange(isOn)
  }

  return (
    <HeadlessSwitch
      ref={switchRef}
      aria-label={label}
      title={label}
      checked={checked}
      onChange={toggle}
      className={`group inline-flex h-7 w-12 shrink-0 items-center rounded-full bg-ink-faded/50 transition data-checked:bg-pen ${FOCUS_CLASSES}`}
    >
      <span className="inline-flex size-6 translate-x-0.5 items-center justify-center rounded-full bg-paper transition group-data-checked:translate-x-5.5 motion-reduce:transition-none">
        {KnobIcon && <KnobIcon className="size-4 text-pen" />}
      </span>
    </HeadlessSwitch>
  )
}
