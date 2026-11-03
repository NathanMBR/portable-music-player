import { Button as HeadlessButton } from '@headlessui/react'
import type { ReactNode } from 'react'
import { type ButtonVariant, FOCUS_CLASSES, VARIANT_CLASSES } from '../buttonStyles'

type ButtonProps = {
  /** The button's text. */
  children: ReactNode
  /** Runs when the button is clicked or pressed from the keyboard. */
  onClick: () => void
  /**
   * The button's look (`buttonStyles.ts`), the same ones `IconButton` takes: `filled` with pen for
   * the one main action on screen, `quiet` or `outlined` for the others.
   */
  variant?: ButtonVariant
}

/**
 * Button with text, like "Try again" under a failed scan. By default it's `filled`, for the one
 * main action on screen, so it stands out from the quiet icon buttons around it. It shares its
 * looks with `IconButton`.
 *
 * @summary Text button, filled for the main action of a view or notice
 */
export const Button = ({ children, onClick, variant = 'filled' }: ButtonProps) => (
  <HeadlessButton
    onClick={onClick}
    className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold ${VARIANT_CLASSES[variant]} ${FOCUS_CLASSES}`}
  >
    {children}
  </HeadlessButton>
)
