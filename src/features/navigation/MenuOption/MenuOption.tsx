import { Button } from '@headlessui/react'
import type { ComponentType } from 'react'
import { ACTIVE_CLASSES, FOCUS_CLASSES } from '../../../components/buttonStyles'

type MenuOptionProps = {
  /** Heroicon before the label, from `@heroicons/react/20/solid`. */
  icon: ComponentType<{ className?: string }>
  /** The option's name, which is also its accessible name. */
  label: string
  /** Runs when the option is clicked or pressed from the keyboard. */
  onClick: () => void
  /** Whether it's the page on screen: it takes the active look and is marked as the current page. */
  isCurrent?: boolean
}

const CURRENT_OPTION_CLASSES = `${ACTIVE_CLASSES} font-semibold`
// Labels stay in full ink, unlike quiet icons, so the options read as easily as titles.
const OTHER_OPTION_CLASSES = 'text-ink data-hover:bg-rule/60'

/**
 * An option of the side menu, its icon before its name, spanning the menu's width, like a category.
 * The page on screen takes the active look of pressed buttons and is marked as the current page.
 *
 * @summary Option of the side menu
 */
export const MenuOption = ({ icon: Icon, label, onClick, isCurrent = false }: MenuOptionProps) => (
  <Button
    aria-current={isCurrent ? 'page' : undefined}
    onClick={onClick}
    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-base ${FOCUS_CLASSES} ${isCurrent ? CURRENT_OPTION_CLASSES : OTHER_OPTION_CLASSES}`}
  >
    <Icon className="size-5" />
    {label}
  </Button>
)
