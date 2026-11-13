import { create } from 'zustand'
import { log } from '../logging/log'
import { type CategoryId, categoryLabel, DEFAULT_CATEGORY } from './categories'

type NavigationStore = {
  isMenuOpen: boolean
  currentCategory: CategoryId
  openMenu: () => void
  closeMenu: () => void
  selectCategory: (category: CategoryId) => void
}

export const useNavigationStore = create<NavigationStore>()((set, get) => ({
  isMenuOpen: false,
  currentCategory: DEFAULT_CATEGORY,
  openMenu: () => set({ isMenuOpen: true }),
  closeMenu: () => set({ isMenuOpen: false }),
  selectCategory: category => {
    if (category !== get().currentCategory) {
      log(`Changing to page "${categoryLabel(category)}"`)
    }
    set({ currentCategory: category, isMenuOpen: false })
  }
}))
