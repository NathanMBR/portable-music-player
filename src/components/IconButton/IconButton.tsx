import { Button } from '@headlessui/react'
import type { ComponentType } from 'react'
import {
  ACTIVE_CLASSES,
  type ButtonVariant,
  DISABLED_CLASSES,
  FOCUS_CLASSES,
  VARIANT_CLASSES
} from '../buttonStyles'

type IconButtonShape = 'circle' | 'square' | 'disc'

type IconButtonProps = {
  /** Heroicon drawn inside the button, usually from `@heroicons/react/20/solid`. */
  icon: ComponentType<{ className?: string }>
  /** Accessible name and hover tooltip, since the button shows no text. */
  label: string
  /** Runs when the button is clicked or pressed from the keyboard. */
  onClick: () => void
  /**
   * The button's geometry. `circle` is the round button of headers, song rows and the audio
   * player. `square` is the button of the app's left column (open and close menu). `disc` is a
   * larger circle, for the main action of a group, like play and pause in the audio player.
   */
  shape?: IconButtonShape
  /**
   * The button's look (`buttonStyles.ts`): `quiet` until hovered, `outlined` with a thin border,
   * or `filled` with pen, like play and pause in the audio player.
   */
  variant?: ButtonVariant
  /**
   * Makes the button a toggle, on when `true`: it takes the active look, a pen icon on a pen tint,
   * and screen readers hear it pressed, like shuffle or a playing song. Leave it out for buttons
   * that aren't toggles.
   */
  isPressed?: boolean
  /**
   * The state of a button with three or more, like repeat's mode, which the log writes after each
   * click. A toggle with only on and off needs `isPressed` alone.
   */
  state?: string
  /** Fades the button and ignores clicks, like "Next song" on the last song without repeat. */
  isDisabled?: boolean
  /** Spins the icon while its action runs, e.g. during a library scan. */
  isBusy?: boolean
}

const SHAPE_CLASSES: Record<IconButtonShape, string> = {
  circle: 'rounded-full p-2',
  square: 'inline-flex size-10 items-center justify-center rounded-lg',
  disc: 'rounded-full p-2.5'
}

/**
 * Button that shows only an icon. Its `label` is both the accessible name and the hover tooltip,
 * so the icon never has to explain itself. Its geometry (`shape`) and its look (`variant`) are
 * chosen apart. It can be a toggle (`isPressed`), have three or more states (`state`), or be
 * disabled. The spin of `isBusy` stops for users
 * who prefer reduced motion.
 *
 * @summary Icon-only button with an accessible label and tooltip
 */
export const IconButton = ({
  icon: Icon,
  label,
  onClick,
  shape = 'circle',
  variant = 'quiet',
  isPressed,
  state,
  isDisabled = false,
  isBusy = false
}: IconButtonProps) => (
  <Button
    aria-label={label}
    aria-pressed={isPressed}
    data-state={state}
    title={label}
    disabled={isDisabled}
    onClick={onClick}
    className={`${SHAPE_CLASSES[shape]} ${isPressed ? ACTIVE_CLASSES : VARIANT_CLASSES[variant]} ${DISABLED_CLASSES} ${FOCUS_CLASSES}`}
  >
    <Icon className={isBusy ? 'size-5 motion-safe:animate-spin' : 'size-5'} />
  </Button>
)
