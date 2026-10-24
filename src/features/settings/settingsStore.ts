import { create } from 'zustand'
import { loadSettings, saveSettings } from './settingsApi'
import { applyTheme, readAppliedTheme } from './theme'
import type { Settings, Theme } from './types'

const DEFAULT_SETTINGS: Settings = { theme: null }

type SettingsStore = {
  settings: Settings
  /** The theme on screen: the saved one, or the OS one when nothing is saved. */
  theme: Theme
  settingsError: string | null
  restoreSettings: () => Promise<void>
  setTheme: (theme: Theme) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
  settings: DEFAULT_SETTINGS,
  theme: readAppliedTheme(),
  settingsError: null,
  restoreSettings: async () => {
    try {
      const settings = await loadSettings()
      set({ settings, settingsError: null })
      if (settings.theme) {
        applyTheme(settings.theme)
        set({ theme: settings.theme })
      }
    } catch (error) {
      set({ settingsError: String(error) })
    }
  },
  setTheme: async theme => {
    applyTheme(theme)
    const settings = { ...get().settings, theme }
    set({ settings, theme })
    try {
      await saveSettings(settings)
      set({ settingsError: null })
    } catch (error) {
      set({ settingsError: String(error) })
    }
  }
}))
