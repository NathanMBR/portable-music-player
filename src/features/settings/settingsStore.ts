import { create } from 'zustand'
import { notifyError } from '../notifications/notify'
import { loadSettings, saveSettings } from './settingsApi'
import { applyTheme, readAppliedTheme } from './theme'
import type { Settings, Theme } from './types'

const DEFAULT_SETTINGS: Settings = { theme: null }

type SettingsStore = {
  settings: Settings
  /** The theme on screen: the saved one, or the OS one when nothing is saved. */
  theme: Theme
  restoreSettings: () => Promise<void>
  setTheme: (theme: Theme) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
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
    const settings = { ...get().settings, theme }
    set({ settings, theme })
    try {
      await saveSettings(settings)
    } catch (error) {
      notifyError("Couldn't save the theme", error)
    }
  }
}))
