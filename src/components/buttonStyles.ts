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

/**
 * The focus ring of a button stretched over a whole row, like a playlist's: the same ring, drawn
 * just inside the row's edges, around the row rather than the button's text.
 */
export const STRETCHED_FOCUS_CLASSES =
  'outline-none data-focus:after:outline-2 data-focus:after:outline-solid data-focus:after:-outline-offset-2 data-focus:after:outline-pen'

/** The panel a button opens over the page, like a select's list or a menu: on the paper, lifted. */
export const POPUP_CLASSES = 'border border-rule bg-paper shadow-lg shadow-shade/20'

/** An option of such a panel, tinted while it's the active one, from the pointer or the keyboard. */
export const POPUP_OPTION_CLASSES = 'text-ink data-focus:bg-rule/60'

/** A step's tab, faded, darker under the pointer when it can be clicked, in pen while current. */
export const STEP_TAB_CLASSES =
  'text-ink-faded data-selected:text-pen data-hover:not-data-selected:text-ink'

/** The bar under the current step's tab. */
export const STEP_INDICATOR_CLASSES = 'bg-pen'

/** A button that can't act right now fades; the base styles give it the not-allowed cursor. */
export const DISABLED_CLASSES = 'data-disabled:opacity-40'
