import { accessibleNameOf } from '../../components/accessibleName'
import { log, logToggle } from './log'

// Set on buttons with three or more states, like repeat (IconButton's `state`).
const STATE_ATTRIBUTE = 'data-state'
// Set on toggles, buttons with only on and off (IconButton's `isPressed`).
const PRESSED_ATTRIBUTE = 'aria-pressed'

// A select opens from a button too, but logs its opening and closing itself (Select): the keyboard
// opens it without a click, and a choice or Escape closes it.
const isSelect = (button: Element) => button.getAttribute('aria-haspopup') === 'listbox'

// A switch is a button too, but logs its new state itself (Switch): the keyboard toggles it
// without a click.
const isSwitch = (button: Element) => button.getAttribute('role') === 'switch'

const logsItself = (button: Element) => isSelect(button) || isSwitch(button)

// A state is logged once the click has taken effect: React draws what the click changed in a
// microtask, so a task queued now runs after it.
const onceTheClickTakesEffect = (logState: () => void) => setTimeout(logState, 0)

// The name is the one the button had when clicked, like "Repeat off", which the click may change.
const logButton = (button: Element) => {
  const name = accessibleNameOf(button)
  if (button.hasAttribute(STATE_ATTRIBUTE)) {
    onceTheClickTakesEffect(() =>
      log(`Clicked at button "${name}" State: "${button.getAttribute(STATE_ATTRIBUTE)}"`)
    )
  } else if (button.hasAttribute(PRESSED_ATTRIBUTE)) {
    onceTheClickTakesEffect(() =>
      logToggle(name, button.getAttribute(PRESSED_ATTRIBUTE) === 'true')
    )
  } else {
    log(`Clicked at button "${name}"`)
  }
}

const logClickedButton = (event: MouseEvent) => {
  if (!(event.target instanceof Element)) return

  const button = event.target.closest('button')
  if (button && !logsItself(button)) logButton(button)
}

/**
 * Logs every button the user clicks or presses from the keyboard, by the name screen readers give
 * it, for as long as the app runs: `Clicked at button "<name>"`. It leaves out switches and the
 * buttons of selects, which log themselves. A toggle logs like a switch, `"<name>" is on` or `off`, and a button with three or more states adds
 * `State: "<state>"`, both in the state the click leaves them in. A plain click is logged before
 * what the button does, as the click goes down to it. Returns a function that stops listening.
 */
export const connectButtonLog = () => {
  document.addEventListener('click', logClickedButton, { capture: true })
  return () => document.removeEventListener('click', logClickedButton, { capture: true })
}
