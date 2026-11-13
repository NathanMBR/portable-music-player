import { Field, Label } from '@headlessui/react'
import type { ReactNode } from 'react'

// The width of the side menu's options, a little heavier than the value beside it, so it stands
// apart without looking large.
const LABEL_CLASSES = 'font-medium text-ink'

type SettingCardProps = {
  /** What the option sets, at the card's left; it also names the control. */
  label: string
  /** The control that sets it, at the card's right, like a `Switch` or a `Select`. */
  children: ReactNode
}

/**
 * One option of the Settings view, in a card of its own: what it sets at the left, the control
 * that sets it at the right, as far in from each side, and both on the card's middle. Every card is
 * at least as tall as the tallest control, so a switch's card and a select's look alike. The label
 * names the control but is passive, so clicking it does nothing: a Headless UI label would hand a
 * switch a synthetic click, which Headless takes for a screen reader's and answers with the focus
 * ring.
 *
 * @summary Settings option card with its label and control
 */
export const SettingCard = ({ label, children }: SettingCardProps) => (
  <Field className="flex min-h-16 items-center justify-between gap-4 rounded-lg border border-rule px-4 py-3">
    <Label passive className={LABEL_CLASSES}>
      {label}
    </Label>
    {children}
  </Field>
)
