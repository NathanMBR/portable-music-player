import { create } from 'zustand'
import { notifyError } from '../notifications/notify'
import { loadSettings, saveSettings } from './settingsApi'
import { applyTheme, readAppliedTheme } from './theme'
import type { SavedPlayback, Settings, SongOrder, Theme } from './types'

// The same as settings.rs gives for a missing settings.json.
const DEFAULT_SETTINGS: Settings = {
  theme: null,
  checksForUpdates: true,
  songOrder: 'title',
  playback: {
    volume: 1,
    isMuted: false,
    repeatMode: 'off',
    isShuffled: false,
    song: null
  }
}

type SettingsStore = {
  settings: Settings
  /** The theme on screen: the saved one, or the OS one when nothing is saved. */
  theme: Theme
  restoreSettings: () => Promise<void>
  setTheme: (theme: Theme) => Promise<void>
  setChecksForUpdates: (checksForUpdates: boolean) => Promise<void>
  setSongOrder: (songOrder: SongOrder) => Promise<void>
  /** Saves what the player is left with, for the app to put back when it opens again. */
  savePlayback: (playback: SavedPlayback) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>()((set, get) => {
  // A choice applies at once and stays even if saving fails, with a notification saying why.
  const saveChoice = async (choice: Partial<Settings>, failureTitle: string) => {
    const settings = { ...get().settings, ...choice }
    set({ settings })
    try {
      await saveSettings(settings)
    } catch (error) {
      notifyError(failureTitle, error)
    }
  }

  return {
    settings: DEFAULT_SETTINGS,
    theme: readAppliedTheme(),
    restoreSettings: async () => {
      try {
        const settings = await loadSettings()
        set({ settings })
        if (settings.theme) {
          applyTheme(settings.theme)
          set({ theme: settings.theme })
        }
      } catch (error) {
        notifyError("Couldn't load your settings", error)
      }
    },
    setTheme: async theme => {
      applyTheme(theme)
      set({ theme })
      await saveChoice({ theme }, "Couldn't save the theme")
    },
    setChecksForUpdates: checksForUpdates =>
      saveChoice({ checksForUpdates }, "Couldn't save the update setting"),
    setSongOrder: songOrder => saveChoice({ songOrder }, "Couldn't save the song order"),
    savePlayback: playback => saveChoice({ playback }, "Couldn't save the player's state")
  }
})
