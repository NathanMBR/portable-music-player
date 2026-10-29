import { beforeEach, describe, expect, it, vi } from 'vitest'
import { failingCommand, mockCommands } from '../../testing/mockCommands'
import { shownNotifications } from '../../testing/notifications'
import { useSettingsStore } from './settingsStore'
import type { Theme } from './types'

const SAVE_ERROR = "Couldn't save the settings at settings.json: read-only file system"

const themeOnScreen = () => document.documentElement.dataset.theme

const followOperatingSystemTheme = (theme: Theme) => {
  // index.html does this before the first paint.
  document.documentElement.dataset.theme = theme
}

beforeEach(() => {
  followOperatingSystemTheme('light')
})

describe('restoreSettings', () => {
  it('applies the saved theme', async () => {
    mockCommands({ load_settings: () => ({ theme: 'dark' }) })

    await useSettingsStore.getState().restoreSettings()

    expect(themeOnScreen()).toBe('dark')
    expect(useSettingsStore.getState().theme).toBe('dark')
  })

  it("keeps the operating system's theme when none was saved", async () => {
    followOperatingSystemTheme('dark')
    mockCommands({ load_settings: () => ({ theme: null }) })

    await useSettingsStore.getState().restoreSettings()

    expect(themeOnScreen()).toBe('dark')
  })

  it("notifies why the settings couldn't be loaded", async () => {
    const loadError = "The settings at settings.json aren't valid: expected value"
    mockCommands({ load_settings: failingCommand(loadError) })

    await useSettingsStore.getState().restoreSettings()

    expect(shownNotifications()).toEqual([
      { type: 'error', title: "Couldn't load your settings", description: loadError }
    ])
  })
})

describe('setTheme', () => {
  it('applies the theme and saves it to settings.json', async () => {
    const saveSettings = vi.fn()
    mockCommands({ save_settings: saveSettings })

    await useSettingsStore.getState().setTheme('dark')

    expect(themeOnScreen()).toBe('dark')
    expect(useSettingsStore.getState().theme).toBe('dark')
    expect(saveSettings).toHaveBeenCalledWith({ settings: { theme: 'dark' } })
  })

  it('keeps the chosen theme on screen and notifies why saving failed', async () => {
    mockCommands({ save_settings: failingCommand(SAVE_ERROR) })

    await useSettingsStore.getState().setTheme('dark')

    expect(themeOnScreen()).toBe('dark')
    expect(shownNotifications()).toEqual([
      { type: 'error', title: "Couldn't save the theme", description: SAVE_ERROR }
    ])
  })
})
