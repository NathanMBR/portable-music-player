import { RadioGroup as HeadlessRadioGroup, Label, Radio } from '@headlessui/react'
import type { ReactNode } from 'react'
import { log } from '../../features/logging/log'
import { ListRow } from '../ListRow/ListRow'

type RadioOption<Value extends string> = {
  /** What `onChange` gets when this option is chosen. */
  value: Value
  /** The option's name, for screen readers and the log, and its text when it has no `content`. */
  label: string
  /** What the option shows beside its dot instead of its label, like a song's cover and name. */
  content?: ReactNode
}

/** `inline`: the options side by side on one line. `rows`: the rows of a list, between rules. */
type RadioGroupLayout = 'inline' | 'rows'

type RadioGroupProps<Value extends string> = {
  /** The group's name, for screen readers and the log, like "Place it". */
  label: string
  /** The options, in the order they're shown. */
  options: readonly RadioOption<Value>[]
  /** The chosen option's value, or `null` while none is. */
  value: Value | null
  /** Runs with the value of the option chosen by a click or from the keyboard. */
  onChange: (value: Value) => void
  /** How the options are laid out. */
  layout?: RadioGroupLayout
  /** Shows the label before the options; otherwise only screen readers hear it. */
  isLabelShown?: boolean
}

// The ring goes around the dot alone, like FOCUS_CLASSES' ring, for the keyboard only.
const DOT_FOCUS_CLASSES =
  'group-data-focus:outline-2 group-data-focus:outline-solid group-data-focus:outline-offset-2 group-data-focus:outline-pen'

const RadioDot = () => (
  <span
    className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-ink-faded group-data-checked:border-pen ${DOT_FOCUS_CLASSES}`}
  >
    <span className="invisible size-2.5 rounded-full bg-pen group-data-checked:visible" />
  </span>
)

type RadioChoiceProps<Value extends string> = {
  option: RadioOption<Value>
  layout: RadioGroupLayout
}

// In a row, the whole row is the option, so a click anywhere on it chooses it.
const RadioChoice = <Value extends string>({ option, layout }: RadioChoiceProps<Value>) => (
  <Radio
    as="div"
    value={option.value}
    aria-label={option.label}
    className={`group flex min-w-0 cursor-pointer items-center outline-none ${layout === 'rows' ? 'flex-1 gap-3' : 'gap-2'}`}
  >
    <RadioDot />
    {option.content ?? option.label}
  </Radio>
)

/**
 * A choice of one option among a few shown at once, each with a round dot: empty, or holding a pen
 * dot once chosen. The options sit side by side on one line, like Before and After in the Change
 * position dialog, or as the rows of a list, like the songs it places a song by. A click anywhere on
 * an option chooses it; from the keyboard, Tab reaches the chosen option, or the first, and the
 * arrows move to the next one and choose it, which also shows the focus ring around its dot. Each
 * choice is logged under the group's label, with the option's.
 *
 * @summary Single choice among options shown at once
 */
export const RadioGroup = <Value extends string>({
  label,
  options,
  value,
  onChange,
  layout = 'inline',
  isLabelShown = false
}: RadioGroupProps<Value>) => {
  // Chosen from the pointer or the keyboard alike.
  const choose = (chosenValue: Value | null) => {
    const chosen = options.find(option => option.value === chosenValue)
    if (!chosen) {
      return
    }
    log(`Radio group "${label}" set value to "${chosen.label}"`)
    onChange(chosen.value)
  }

  return (
    <HeadlessRadioGroup
      value={value}
      onChange={choose}
      // A shown label names the group through Headless UI, which sets its aria-labelledby itself.
      aria-label={isLabelShown ? undefined : label}
      className={layout === 'inline' ? 'flex flex-wrap items-center gap-x-6 gap-y-2' : undefined}
    >
      {isLabelShown && (
        <Label as="span" className="text-sm font-semibold text-ink">
          {label}
        </Label>
      )}
      {layout === 'rows' ? (
        <ul>
          {options.map(option => (
            <ListRow key={option.value}>
              <RadioChoice option={option} layout={layout} />
            </ListRow>
          ))}
        </ul>
      ) : (
        options.map(option => <RadioChoice key={option.value} option={option} layout={layout} />)
      )}
    </HeadlessRadioGroup>
  )
}
