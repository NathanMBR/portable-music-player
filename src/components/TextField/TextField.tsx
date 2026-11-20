import { Field, Input, Label } from '@headlessui/react'
import { FOCUS_CLASSES } from '../buttonStyles'

type TextFieldProps = {
  /** The visible label above the box, which names the field. */
  label: string
  /** The text in the box. */
  value: string
  /** Runs with the new text at each change. */
  onChange: (value: string) => void
  /** `search` for a search box, which also offers to clear what was typed. */
  type?: 'text' | 'search'
  /** Faded text in the empty box, saying what goes in it. */
  placeholder?: string
  /** The most characters it takes. */
  maxLength?: number
  /** Screen readers hear it as required, like a new playlist's title. */
  isRequired?: boolean
}

/**
 * One-line text box with its label above it, like a new playlist's title. The label names the box
 * for screen readers, and clicking it focuses the box. The box has the keyboard focus ring of
 * every control.
 *
 * @summary Text box with its label
 */
export const TextField = ({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  maxLength,
  isRequired = false
}: TextFieldProps) => (
  <Field className="flex flex-col gap-1.5">
    <Label className="text-sm font-semibold text-ink">{label}</Label>
    <Input
      type={type}
      value={value}
      onChange={event => onChange(event.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      required={isRequired}
      className={`rounded-md border border-rule bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faded ${FOCUS_CLASSES}`}
    />
  </Field>
)
