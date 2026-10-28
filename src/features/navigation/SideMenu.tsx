import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/20/solid'
import { IconButton } from '../../components/IconButton'
import { APP_TITLE_LINES } from '../../constants'
import { ThemeToggle } from '../settings/ThemeToggle'
import { CategoryList } from './CategoryList'
import { useNavigationStore } from './navigationStore'

/**
 * Drawer that slides in from the left over a dimmed page, with the app's name, the categories and
 * the theme toggle. Its close button sits exactly where the menu button was. It closes with that
 * button, Escape, a click outside, or by choosing a category.
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
          <IconButton icon={XMarkIcon} label="Close menu" shape="square" onClick={closeMenu} />
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
        </div>
        <div className="mt-auto border-t border-rule pt-4">
          <ThemeToggle />
        </div>
      </DialogPanel>
    </Dialog>
  )
}
