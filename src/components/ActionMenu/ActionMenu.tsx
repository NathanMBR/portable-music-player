import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { EllipsisVerticalIcon } from '@heroicons/react/20/solid'
import type { ComponentType } from 'react'
import { log } from '../../features/logging/log'
import {
  FOCUS_CLASSES,
  POPUP_CLASSES,
  POPUP_OPTION_CLASSES,
  VARIANT_CLASSES
} from '../buttonStyles'
import { useOpenStateLog } from '../useOpenStateLog'

/** One action of an `ActionMenu`. */
export type ActionMenuItem = {
  /** The item's text, and its accessible name. */
  label: string
  /** Heroicon drawn before the text, from `@heroicons/react/20/solid`. */
  icon: ComponentType<{ className?: string }>
  /** Runs when the item is clicked, or chosen with Enter or Space. */
  onClick: () => void
}

type ActionMenuProps = {
  /** The menu button's accessible name and hover tooltip, naming what it's for: "More for Darts". */
  label: string
  /** The actions, in the order they're listed. */
  items: readonly ActionMenuItem[]
}

// A component, since the menu's open state only comes from Headless UI's render prop.
const OpenStateLog = ({ isOpen, label }: { isOpen: boolean; label: string }) => {
  useOpenStateLog(isOpen, nowOpen => log(`${nowOpen ? 'Opened' : 'Closed'} menu "${label}"`))
  return null
}

/**
 * Round button with three vertical dots, opening a menu of actions below it, like what can be done
 * to a song of a playlist. The menu fades in from a slightly smaller size, growing from its corner
 * under the button, and fades out the same way. Each item shows an icon and its text, and closes
 * the menu once chosen. From the keyboard, Enter, Space or the down arrow opens it, the arrows move
 * through the items, Enter or Space chooses one, and Escape closes it, giving the focus back to its
 * button. The menu logs its opening and closing under its label, and its items are logged as
 * clicked buttons.
 *
 * @summary Button opening a menu of actions
 */
export const ActionMenu = ({ label, items }: ActionMenuProps) => (
  <Menu>
    {({ open }) => (
      <>
        <OpenStateLog isOpen={open} label={label} />
        <MenuButton
          aria-label={label}
          title={label}
          className={`rounded-full p-2 ${VARIANT_CLASSES.quiet} ${FOCUS_CLASSES}`}
        >
          <EllipsisVerticalIcon className="size-5" />
        </MenuButton>
        <MenuItems
          anchor={{ to: 'bottom end', gap: 4 }}
          transition
          className={`z-20 min-w-44 origin-top-right rounded-lg p-1 outline-none transition duration-150 ease-out data-closed:scale-95 data-closed:opacity-0 motion-reduce:transition-none ${POPUP_CLASSES}`}
        >
          {items.map(({ label: itemLabel, icon: Icon, onClick }) => (
            <MenuItem key={itemLabel}>
              <button
                type="button"
                onClick={onClick}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${POPUP_OPTION_CLASSES}`}
              >
                <Icon className="size-5 text-ink-faded" />
                {itemLabel}
              </button>
            </MenuItem>
          ))}
        </MenuItems>
      </>
    )}
  </Menu>
)
