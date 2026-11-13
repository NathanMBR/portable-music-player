import { accessibleNameOf } from '../../components/accessibleName'
import { log } from './log'

// A switch is a button too, but logs its new state itself (Switch): the keyboard toggles it
// without a click.
const isSwitch = (button: Element) => button.getAttribute('role') === 'switch'

const logClickedButton = (event: MouseEvent) => {
  if (!(event.target instanceof Element)) return

  const button = event.target.closest('button')
  if (button && !isSwitch(button)) log(`Clicked at button "${accessibleNameOf(button)}"`)
}

/**
 * Logs every button the user clicks or presses from the keyboard, by the name screen readers
 * give it, for as long as the app runs. It listens while the click goes down to the button, so
 * the click is logged before what the button does. Returns a function that stops listening.
 */
export const connectButtonLog = () => {
  document.addEventListener('click', logClickedButton, { capture: true })
  return () => document.removeEventListener('click', logClickedButton, { capture: true })
}
