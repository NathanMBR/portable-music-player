import { Button as HeadlessButton } from '@headlessui/react'
import { type PointerEvent, type ReactNode, useId, useState } from 'react'
import {
  type ButtonVariant,
  DISABLED_CLASSES,
  FOCUS_CLASSES,
  VARIANT_CLASSES
} from '../buttonStyles'
import { canHover } from '../pointerHover'
import { Tooltip } from '../Tooltip/Tooltip'

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
  /** Fades the button and ignores clicks, like Save before a new playlist has a title. */
  isDisabled?: boolean
  /**
   * Why the button is disabled, like "Disabled while automatic update checks are on": a tooltip
   * above it while the pointer is over it, and its description for screen readers. It shows only
   * while `isDisabled`.
   */
  disabledReason?: string
}

// How far above the button the tooltip's arrow points.
const TOOLTIP_OFFSET = 4

type Anchor = { x: number; y: number }

type DisabledReasonProps = {
  reason: string
  /** The id the button's `aria-describedby` points at. */
  reasonId: string
  children: ReactNode
}

// A disabled button may get no pointer events, depending on the webview, so the button lets the
// pointer through to this wrapper, which follows it and shows the cursor saying it can't act.
const DisabledReason = ({ reason, reasonId, children }: DisabledReasonProps) => {
  const [anchor, setAnchor] = useState<Anchor | null>(null)

  const showReason = (event: PointerEvent<HTMLSpanElement>) => {
    if (!canHover(event.pointerType)) {
      return
    }
    const area = event.currentTarget.getBoundingClientRect()
    setAnchor({ x: area.left + area.width / 2, y: area.top - TOOLTIP_OFFSET })
  }

  return (
    <span
      className="inline-flex cursor-not-allowed"
      onPointerEnter={showReason}
      onPointerLeave={() => setAnchor(null)}
    >
      {children}
      <span id={reasonId} hidden>
        {reason}
      </span>
      {anchor && <Tooltip text={reason} x={anchor.x} y={anchor.y} />}
    </span>
  )
}

/**
 * Button with text, like "Try again" under a failed scan. By default it's `filled`, for the one
 * main action on screen, so it stands out from the quiet icon buttons around it. It shares its
 * looks with `IconButton`. It can be disabled, and then say why (`disabledReason`), in a tooltip
 * above it while the pointer is over it.
 *
 * @summary Text button, filled for the main action of a view or notice
 */
export const Button = ({
  children,
  onClick,
  variant = 'filled',
  isDisabled = false,
  disabledReason
}: ButtonProps) => {
  const reasonId = useId()
  const reason = isDisabled ? disabledReason : undefined

  const button = (
    <HeadlessButton
      disabled={isDisabled}
      aria-describedby={reason ? reasonId : undefined}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold ${VARIANT_CLASSES[variant]} ${DISABLED_CLASSES} ${FOCUS_CLASSES} ${reason ? 'pointer-events-none' : ''}`}
    >
      {children}
    </HeadlessButton>
  )

  if (!reason) {
    return button
  }
  return (
    <DisabledReason reason={reason} reasonId={reasonId}>
      {button}
    </DisabledReason>
  )
}
