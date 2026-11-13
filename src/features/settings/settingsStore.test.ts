import { beforeEach, describe, expect, it, vi } from 'vitest'
import { failingCommand, mockCommands } from '../../testing/mockCommands'
import { shownNotifications } from '../../testing/notifications'
import { useSettingsStore } from './settingsStore'
import type { SavedPlayback, Settings, Theme } from './types'

const SAVE_ERROR = "Couldn't save the settings at settings.json: read-only file system"

const SAVED_DEFAULTS: Settings = {
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
    mockCommands({ load_settings: () => ({ ...SAVED_DEFAULTS, theme: 'dark' }) })

    await useSettingsStore.getState().restoreSettings()

    expect(themeOnScreen()).toBe('dark')
    expect(useSettingsStore.getState().theme).toBe('dark')
  })

  it("keeps the operating system's theme when none was saved", async () => {
    followOperatingSystemTheme('dark')
    mockCommands({ load_settings: () => SAVED_DEFAULTS })

    await useSettingsStore.getState().restoreSettings()

    expect(themeOnScreen()).toBe('dark')
  })

  it('restores the saved update and song order choices', async () => {
    mockCommands({
      load_settings: () => ({ ...SAVED_DEFAULTS, checksForUpdates: false, songOrder: 'fileName' })
    })

    await useSettingsStore.getState().restoreSettings()

    expect(useSettingsStore.getState().settings).toMatchObject({
      checksForUpdates: false,
      songOrder: 'fileName'
    })
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
    expect(saveSettings).toHaveBeenCalledWith({ settings: { ...SAVED_DEFAULTS, theme: 'dark' } })
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

describe('setChecksForUpdates', () => {
  it('saves the choice to settings.json, along with the other settings', async () => {
    const saveSettings = vi.fn()
    mockCommands({ save_settings: saveSettings })

    await useSettingsStore.getState().setChecksForUpdates(false)

    expect(useSettingsStore.getState().settings.checksForUpdates).toBe(false)
    expect(saveSettings).toHaveBeenCalledWith({
      settings: { ...SAVED_DEFAULTS, checksForUpdates: false }
    })
  })

  it('keeps the choice and notifies why saving failed', async () => {
    mockCommands({ save_settings: failingCommand(SAVE_ERROR) })

    await useSettingsStore.getState().setChecksForUpdates(false)

    expect(useSettingsStore.getState().settings.checksForUpdates).toBe(false)
    expect(shownNotifications()).toEqual([
      { type: 'error', title: "Couldn't save the update setting", description: SAVE_ERROR }
    ])
  })
})

describe('setSongOrder', () => {
  it('saves the order to settings.json, along with the other settings', async () => {
    const saveSettings = vi.fn()
    mockCommands({ save_settings: saveSettings })

    await useSettingsStore.getState().setSongOrder('fileName')

    expect(useSettingsStore.getState().settings.songOrder).toBe('fileName')
    expect(saveSettings).toHaveBeenCalledWith({
      settings: { ...SAVED_DEFAULTS, songOrder: 'fileName' }
    })
  })

  it('keeps the order and notifies why saving failed', async () => {
    mockCommands({ save_settings: failingCommand(SAVE_ERROR) })

    await useSettingsStore.getState().setSongOrder('fileName')

    expect(useSettingsStore.getState().settings.songOrder).toBe('fileName')
    expect(shownNotifications()).toEqual([
      { type: 'error', title: "Couldn't save the song order", description: SAVE_ERROR }
    ])
  })
})

describe('savePlayback', () => {
  const playbackLeft: SavedPlayback = {
    volume: 0.35,
    isMuted: false,
    repeatMode: 'all',
    isShuffled: true,
    song: { fileName: 'Know.mp3', elapsedSeconds: 42.5 }
  }

  it("saves the player's state to settings.json, along with the other settings", async () => {
    const saveSettings = vi.fn()
    mockCommands({ save_settings: saveSettings })

    await useSettingsStore.getState().savePlayback(playbackLeft)

    expect(useSettingsStore.getState().settings.playback).toEqual(playbackLeft)
    expect(saveSettings).toHaveBeenCalledWith({
      settings: { ...SAVED_DEFAULTS, playback: playbackLeft }
    })
  })

  it('notifies why saving failed', async () => {
    mockCommands({ save_settings: failingCommand(SAVE_ERROR) })

    await useSettingsStore.getState().savePlayback(playbackLeft)

    expect(shownNotifications()).toEqual([
      { type: 'error', title: "Couldn't save the player's state", description: SAVE_ERROR }
    ])
  })
})
