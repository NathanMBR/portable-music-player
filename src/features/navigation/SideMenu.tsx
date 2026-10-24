import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/20/solid'
import { IconButton } from '../../components/IconButton'
import { APP_TITLE } from '../../constants'
import { ThemeToggle } from '../settings/ThemeToggle'
import { CategoryList } from './CategoryList'
import { useNavigationStore } from './navigationStore'

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
        className="fixed inset-y-0 left-0 flex w-72 flex-col border-r border-ink bg-paper px-6 pt-8 pb-6 transition duration-200 ease-out data-closed:-translate-x-full motion-reduce:transition-none"
      >
        <div className="flex items-center gap-3">
          <IconButton icon={XMarkIcon} label="Close menu" shape="square" onClick={closeMenu} />
          <DialogTitle className="text-base font-bold text-ink font-stretch-semi-condensed">
            {APP_TITLE}
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
