import type { ComponentType } from 'react'
import { LibraryView } from './features/library/LibraryView/LibraryView'
import type { CategoryId } from './features/navigation/categories'
import { MenuButton } from './features/navigation/MenuButton/MenuButton'
import { useNavigationStore } from './features/navigation/navigationStore'
import { SideMenu } from './features/navigation/SideMenu/SideMenu'
import { NotificationArea } from './features/notifications/NotificationArea/NotificationArea'
import { AudioPlayer } from './features/playback/AudioPlayer/AudioPlayer'
import { PLAYER_HEIGHT } from './features/playback/constants'
import { usePlaybackStore } from './features/playback/playbackStore'
import { SettingsView } from './features/settings/SettingsView/SettingsView'

// Kept here, where the features meet, so the navigation feature never imports the views it
// switches between.
const viewByCategory: Record<CategoryId, ComponentType> = {
  songs: LibraryView,
  settings: SettingsView
}

/**
 * The page shell: the side menu, the current category's view filling the window, with the menu
 * button in its left margin, the audio player along the bottom while a song is loaded, and the
 * notification area in the bottom-right corner. The window never scrolls: the view scrolls its own
 * content, which reaches the window's bottom edge, or ends above the player while it's open. The
 * player sits outside the views, so a song keeps playing when the category changes.
 *
 * @summary App shell
 */
export const App = () => {
  const currentCategory = useNavigationStore(state => state.currentCategory)
  const isPlayerOpen = usePlaybackStore(state => state.session !== null)
  const CurrentView = viewByCategory[currentCategory]

  return (
    <>
      <SideMenu />
      {/* The window never scrolls: views scroll their own content. The player's space opens and
          closes as it slides, so the content ends above the player only while it's there. */}
      <div
        className={`relative h-dvh transition-[padding] duration-300 ease-out motion-reduce:transition-none ${isPlayerOpen ? 'pb-player' : ''}`}
      >
        {/* The menu button sits in the views' left margin, so nothing ever sits under it. */}
        <div className="absolute top-8 left-6">
          <MenuButton />
        </div>
        <CurrentView />
      </div>
      <AudioPlayer />
      <NotificationArea bottomClearance={isPlayerOpen ? PLAYER_HEIGHT : undefined} />
    </>
  )
}
