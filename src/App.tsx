import type { ComponentType } from 'react'
import { LibraryView } from './features/library/LibraryView'
import type { CategoryId } from './features/navigation/categories'
import { useNavigationStore } from './features/navigation/navigationStore'
import { SideMenu } from './features/navigation/SideMenu'

// Kept here instead of in categories.ts: views import MenuButton from navigation, so mapping
// views inside navigation would create a circular import.
const viewByCategory: Record<CategoryId, ComponentType> = {
  songs: LibraryView
}

export const App = () => {
  const currentCategory = useNavigationStore(state => state.currentCategory)
  const CurrentView = viewByCategory[currentCategory]

  return (
    <>
      <SideMenu />
      <CurrentView />
    </>
  )
}
