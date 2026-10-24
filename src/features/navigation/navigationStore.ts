import { create } from 'zustand'
import { type CategoryId, DEFAULT_CATEGORY } from './categories'

type NavigationStore = {
  isMenuOpen: boolean
  currentCategory: CategoryId
  openMenu: () => void
  closeMenu: () => void
  selectCategory: (category: CategoryId) => void
}

export const useNavigationStore = create<NavigationStore>()(set => ({
  isMenuOpen: false,
  currentCategory: DEFAULT_CATEGORY,
  openMenu: () => set({ isMenuOpen: true }),
  closeMenu: () => set({ isMenuOpen: false }),
  selectCategory: category => set({ currentCategory: category, isMenuOpen: false })
}))
