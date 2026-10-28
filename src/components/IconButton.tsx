import { Button } from '@headlessui/react'
import type { ComponentType } from 'react'

type IconButtonShape = 'circle' | 'square'

type IconButtonProps = {
  /** Heroicon drawn inside the button, usually from `@heroicons/react/20/solid`. */
  icon: ComponentType<{ className?: string }>
  /** Accessible name and hover tooltip, since the button shows no text. */
  label: string
  /** Runs when the button is clicked or pressed from the keyboard. */
  onClick: () => void
  /**
   * `circle` is the quiet button of view headers. `square` is the outlined button of the app's
   * left column (open and close menu).
   */
  shape?: IconButtonShape
  /** Spins the icon while its action runs, e.g. during a library scan. */
  isBusy?: boolean
}

const classesByShape: Record<IconButtonShape, string> = {
  circle: 'rounded-full p-2 text-ink-faded data-hover:text-ink',
  square: 'inline-flex size-10 items-center justify-center rounded-lg border border-rule text-ink'
}

/**
 * Button that shows only an icon. Its `label` is both the accessible name and the hover tooltip,
 * so the icon never has to explain itself. The spin of `isBusy` stops for users who prefer
 * reduced motion.
 *
 * @summary Icon-only button with an accessible label and tooltip
 */
export const IconButton = ({
  icon: Icon,
  label,
  onClick,
  shape = 'circle',
  isBusy = false
}: IconButtonProps) => (
  <Button
    aria-label={label}
    title={label}
    onClick={onClick}
    className={`${classesByShape[shape]} data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-pen data-hover:bg-rule/60`}
  >
    <Icon className={isBusy ? 'size-5 motion-safe:animate-spin' : 'size-5'} />
  </Button>
)
