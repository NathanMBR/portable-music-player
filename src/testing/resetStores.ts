import type { StoreApi } from 'zustand'
import { useLibraryStore } from '../features/library/libraryStore'
import { useNavigationStore } from '../features/navigation/navigationStore'
import { useSettingsStore } from '../features/settings/settingsStore'

const resetStore = <State>(store: StoreApi<State>) => store.setState(store.getInitialState(), true)

/**
 * Stores are module-level singletons, so state set by one test or story would leak into the next.
 * Every store must be listed here.
 */
export const resetStores = () => {
  resetStore(useLibraryStore)
  resetStore(useNavigationStore)
  resetStore(useSettingsStore)
}
