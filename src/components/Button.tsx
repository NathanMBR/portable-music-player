import { Button as HeadlessButton } from '@headlessui/react'
import type { ReactNode } from 'react'

type ButtonProps = {
  /** The button's text. */
  children: ReactNode
  /** Runs when the button is clicked or pressed from the keyboard. */
  onClick: () => void
}

/**
 * Filled button for the one main action on screen, like "Try again" under a failed scan. It uses
 * the `pen` color so it stands out from the quiet icon buttons of the headers, which use
 * `IconButton` instead.
 *
 * @summary Filled button for the main action of a view or notice
 */
export const Button = ({ children, onClick }: ButtonProps) => (
  <HeadlessButton
    onClick={onClick}
    className="inline-flex items-center gap-2 rounded-md bg-pen px-3.5 py-2 text-sm font-semibold text-paper data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-pen data-hover:bg-pen/90"
  >
    {children}
  </HeadlessButton>
)
