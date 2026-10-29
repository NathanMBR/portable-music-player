import type { ComponentType } from 'react'
import { LibraryView } from './features/library/LibraryView'
import type { CategoryId } from './features/navigation/categories'
import { MenuButton } from './features/navigation/MenuButton'
import { useNavigationStore } from './features/navigation/navigationStore'
import { SideMenu } from './features/navigation/SideMenu'
import { NotificationArea } from './features/notifications/NotificationArea'

// Kept here, where the features meet, so the navigation feature never imports the views it
// switches between.
const viewByCategory: Record<CategoryId, ComponentType> = {
  songs: LibraryView
}

/**
 * The page shell: the side menu, the menu button's column on the left, the current category's
 * view, an empty column on the right that keeps the view's margins equal, and the notification
 * area in the bottom-right corner.
 *
 * @summary App shell
 */
export const App = () => {
  const currentCategory = useNavigationStore(state => state.currentCategory)
  const CurrentView = viewByCategory[currentCategory]

  return (
    <>
      <SideMenu />
      <div className="flex gap-4 px-6">
        {/* The menu button has a column of its own, so nothing ever sits under it. An empty
            column of the same width on the right keeps the view's margins equal on both sides. */}
        <div className="sticky top-0 w-10 shrink-0 self-start pt-8">
          <MenuButton />
        </div>
        <div className="min-w-0 flex-1">
          <CurrentView />
        </div>
        <div aria-hidden="true" className="w-10 shrink-0" />
      </div>
      <NotificationArea />
    </>
  )
}
