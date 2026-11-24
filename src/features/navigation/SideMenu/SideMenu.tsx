import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { ArrowDownTrayIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { IconButton } from '../../../components/IconButton/IconButton'
import { APP_TITLE_LINES } from '../../../constants'
import { ThemeToggle } from '../../settings/ThemeToggle/ThemeToggle'
import { useUpdateStore } from '../../updates/updateStore'
import { CategoryList } from '../CategoryList/CategoryList'
import { MenuOption } from '../MenuOption/MenuOption'
import { useNavigationStore } from '../navigationStore'

// Not a page: it opens the update's dialog, once the menu is closed, so the two never stack.
const UpdateOption = () => {
  const hasUpdate = useUpdateStore(state => state.foundUpdate !== null)
  const openDialog = useUpdateStore(state => state.openDialog)
  const closeMenu = useNavigationStore(state => state.closeMenu)

  if (!hasUpdate) {
    return null
  }
  const openUpdate = () => {
    closeMenu()
    openDialog()
  }
  return (
    <div className="mt-1">
      <MenuOption icon={ArrowDownTrayIcon} label="Update" hasNotificationDot onClick={openUpdate} />
    </div>
  )
}

/**
 * Drawer that slides in from the left over a dimmed page, with the app's name, the categories and
 * the theme toggle. While an update is offered, an Update option follows the categories, with a
 * dot on its icon, and opens the update's dialog. Its close button sits exactly where the menu
 * button was. It closes with that button, Escape, a click outside, by choosing a category, or with
 * Update.
 *
 * @summary Side menu drawer
 */
export const SideMenu = () => {
  const isMenuOpen = useNavigationStore(state => state.isMenuOpen)
  const closeMenu = useNavigationStore(state => state.closeMenu)

  return (
    <Dialog open={isMenuOpen} onClose={closeMenu} className="relative z-10">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-shade/30 transition duration-200 ease-out data-closed:opacity-0 motion-reduce:transition-none"
      />
      {/* Same padding as the page header, so the close button sits exactly where the menu button was. */}
      <DialogPanel
        transition
        className="fixed inset-y-0 left-0 flex w-72 flex-col border-r border-rule bg-paper px-6 pt-8 pb-6 transition duration-200 ease-out data-closed:-translate-x-full motion-reduce:transition-none"
      >
        <div className="flex items-start gap-3">
          <IconButton
            icon={XMarkIcon}
            label="Close menu"
            shape="square"
            variant="outlined"
            onClick={closeMenu}
          />
          {/* Same type as the page title. The trailing spaces keep the accessible name "Portable Music Player". */}
          <DialogTitle className="text-lg leading-tight font-extrabold tracking-tight text-ink font-stretch-expanded">
            {APP_TITLE_LINES.map(line => (
              <span key={line} className="block">
                {line}{' '}
              </span>
            ))}
          </DialogTitle>
        </div>
        <div className="mt-8">
          <CategoryList />
          <UpdateOption />
        </div>
        <div className="mt-auto border-t border-rule pt-4">
          <ThemeToggle />
        </div>
      </DialogPanel>
    </Dialog>
  )
}
