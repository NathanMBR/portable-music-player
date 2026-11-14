import { toast } from 'sonner'
import type { StoreApi } from 'zustand'
import { useCoverStore } from '../features/library/coverStore'
import { useLibraryStore } from '../features/library/libraryStore'
import { useNavigationStore } from '../features/navigation/navigationStore'
import { usePlaybackStore } from '../features/playback/playbackStore'
import { useSettingsStore } from '../features/settings/settingsStore'
import { useSongDropStore } from '../features/songDrop/songDropStore'
import { forgetLoggedMessages } from './logs'

const resetStore = <State>(store: StoreApi<State>) => store.setState(store.getInitialState(), true)

/**
 * Stores are module-level singletons, so state set by one test or story would leak into the next.
 * Every store must be listed here. Sonner keeps the notifications in a singleton of its own, so
 * they're dismissed too, and the logged messages are forgotten.
 */
export const resetStores = () => {
  resetStore(useCoverStore)
  resetStore(useLibraryStore)
  resetStore(useNavigationStore)
  resetStore(usePlaybackStore)
  resetStore(useSettingsStore)
  resetStore(useSongDropStore)
  toast.dismiss()
  forgetLoggedMessages()
}
