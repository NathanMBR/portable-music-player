import { create } from 'zustand'
import { log } from '../logging/log'
import { useSettingsStore } from '../settings/settingsStore'
import type { FoundUpdate } from './types'
import { checkForUpdate } from './updatesApi'

type UpdateStore = {
  /** Whether a check for a newer release runs. */
  isChecking: boolean
  /** The newer release the last check found, `null` while there's none to offer. */
  foundUpdate: FoundUpdate | null
  /**
   * Looks for a newer release as the app opens, when the settings say to. A failure is only
   * logged: a flash drive often runs on offline computers, where a notification at every launch
   * would nag.
   */
  checkAtLaunch: () => Promise<void>
}

export const useUpdateStore = create<UpdateStore>()(set => {
  const findUpdate = async () => {
    set({ isChecking: true })
    try {
      const foundUpdate = await checkForUpdate()
      log(foundUpdate ? `Found update to version ${foundUpdate.version}` : 'Found no update')
      return foundUpdate
    } finally {
      set({ isChecking: false })
    }
  }

  return {
    isChecking: false,
    foundUpdate: null,
    checkAtLaunch: async () => {
      if (!useSettingsStore.getState().settings.checksForUpdates) {
        return
      }
      try {
        set({ foundUpdate: await findUpdate() })
      } catch (error) {
        log(`Couldn't check for updates: ${String(error)}`)
      }
    }
  }
})
