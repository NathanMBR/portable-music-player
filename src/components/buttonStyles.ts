// The looks and states every button shares, so the same situation looks the same everywhere.
// Components own their geometry (padding, size, radius) and compose these for color and state.

/** How a button looks, named by its look rather than its importance. */
export type ButtonVariant = 'quiet' | 'outlined' | 'filled'

/** The colors of each look, hover included. */
export const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  quiet: 'text-ink-faded data-hover:bg-rule/60 data-hover:text-ink',
  outlined: 'border border-rule text-ink data-hover:bg-rule/60',
  filled: 'bg-pen text-paper data-hover:bg-pen/90'
}

/**
 * The colors of a button that is on, in place of its look's: a pressed toggle, a playing song, the
 * current category. A pen icon alone is too close to the faded ones on the light paper, so it also
 * sits on a pen tint.
 */
export const ACTIVE_CLASSES = 'bg-pen/15 text-pen data-hover:bg-pen/20'

/**
 * The keyboard focus ring of every control. Headless UI sets `data-focus` only for the keyboard,
 * while the browser's own ring also shows after some clicks, so that one is always off. Tailwind's
 * `outline-none` also resets the outline style the focused state's width relies on, hence
 * `outline-solid`.
 */
export const FOCUS_CLASSES =
  'outline-none data-focus:outline-2 data-focus:outline-solid data-focus:outline-offset-2 data-focus:outline-pen'

/** A button that can't act right now fades; the base styles give it the not-allowed cursor. */
export const DISABLED_CLASSES = 'data-disabled:opacity-40'
