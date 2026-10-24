import type { ComponentType } from 'react'
import { LibraryView } from './features/library/LibraryView'
import type { CategoryId } from './features/navigation/categories'
import { MenuButton } from './features/navigation/MenuButton'
import { useNavigationStore } from './features/navigation/navigationStore'
import { SideMenu } from './features/navigation/SideMenu'

// Kept here, where the features meet, so the navigation feature never imports the views it
// switches between.
const viewByCategory: Record<CategoryId, ComponentType> = {
  songs: LibraryView
}

export const App = () => {
  const currentCategory = useNavigationStore(state => state.currentCategory)
  const CurrentView = viewByCategory[currentCategory]

  return (
    <>
      <SideMenu />
      <div className="flex gap-4 px-6">
        {/* The menu button has a column of its own, so nothing ever sits under it. */}
        <div className="sticky top-0 self-start pt-8">
          <MenuButton />
        </div>
        <div className="min-w-0 flex-1">
          <CurrentView />
        </div>
      </div>
    </>
  )
}
