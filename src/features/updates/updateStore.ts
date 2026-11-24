import { create } from 'zustand'
import { log } from '../logging/log'
import { notify, notifyError } from '../notifications/notify'
import { useSettingsStore } from '../settings/settingsStore'
import type { FoundUpdate } from './types'
import { checkForUpdate, installUpdate } from './updatesApi'

type UpdateStore = {
  /** Whether a check for a newer release runs. */
  isChecking: boolean
  /** The newer release the last check found, `null` while there's none to offer. */
  foundUpdate: FoundUpdate | null
  /** Whether the dialog offering the update found is open. */
  isDialogOpen: boolean
  /** Whether the update found downloads, which keeps its dialog open. */
  isDownloading: boolean
  /**
   * Looks for a newer release as the app opens, when the settings say to. A failure is only
   * logged: a flash drive often runs on offline computers, where a notification at every launch
   * would nag.
   */
  checkAtLaunch: () => Promise<void>
  /**
   * Looks for a newer release when asked from the Settings view, whatever the settings say. It
   * says so when there's none, and notifies a failure.
   */
  checkByHand: () => Promise<void>
  openDialog: () => void
  /** Closes the dialog, except while the update downloads, and still offers the update. */
  closeDialog: () => void
  /**
   * Stops offering the update found, and saves its version as skipped, so the check at launch
   * passes over it.
   */
  skipUpdate: () => Promise<void>
  /**
   * Downloads the update found, then closes its dialog. The update is still offered until the new
   * version runs, since a portable build's download only opens in the browser. A failure keeps the
   * dialog open and notifies why.
   */
  downloadUpdate: () => Promise<void>
}

export const useUpdateStore = create<UpdateStore>()((set, get) => {
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
    isDialogOpen: false,
    isDownloading: false,
    checkAtLaunch: async () => {
      if (!useSettingsStore.getState().settings.checksForUpdates) {
        return
      }
      try {
        set({ foundUpdate: await findUpdate() })
      } catch (error) {
        log(`Couldn't check for updates: ${String(error)}`)
      }
    },
    checkByHand: async () => {
      try {
        const foundUpdate = await findUpdate()
        set({ foundUpdate })
        if (!foundUpdate) {
          notify('No update found', 'You have the latest version.')
        }
      } catch (error) {
        notifyError("Couldn't check for updates", error)
      }
    },
    openDialog: () => set({ isDialogOpen: true }),
    closeDialog: () => {
      if (!get().isDownloading) {
        set({ isDialogOpen: false })
      }
    },
    skipUpdate: async () => {
      const { foundUpdate } = get()
      if (!foundUpdate) {
        return
      }
      log(`Skipped update to version ${foundUpdate.version}`)
      set({ foundUpdate: null, isDialogOpen: false })
      await useSettingsStore.getState().setSkipUpdateVersion(foundUpdate.version)
    },
    downloadUpdate: async () => {
      set({ isDownloading: true })
      try {
        await installUpdate()
        set({ isDialogOpen: false })
      } catch (error) {
        notifyError("Couldn't download the update", error)
      } finally {
        set({ isDownloading: false })
      }
    }
  }
})
