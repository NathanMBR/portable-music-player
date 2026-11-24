import { describe, expect, it, vi } from 'vitest'
import { loggedMessages } from '../../testing/logs'
import { failingCommand, mockCommands } from '../../testing/mockCommands'
import { shownNotifications } from '../../testing/notifications'
import { useSettingsStore } from '../settings/settingsStore'
import type { FoundUpdate } from './types'
import { useUpdateStore } from './updateStore'

const CHECK_ERROR =
  "Couldn't read the latest release on GitHub: Could not fetch a valid release JSON from the remote"

const NEW_VERSION: FoundUpdate = {
  version: '0.2.0',
  notes: '## New features\n\n- Checks for updates when the app opens'
}

const skipNewVersion = () => {
  useSettingsStore.setState(state => ({
    settings: { ...state.settings, skipUpdateVersion: NEW_VERSION.version }
  }))
}

const turnOffAutomaticChecks = () => {
  useSettingsStore.setState(state => ({
    settings: { ...state.settings, checksForUpdates: false }
  }))
}

describe('checkAtLaunch', () => {
  it('offers the newer release it finds', async () => {
    mockCommands({ check_for_update: () => NEW_VERSION })

    await useUpdateStore.getState().checkAtLaunch()

    expect(useUpdateStore.getState().foundUpdate).toEqual(NEW_VERSION)
    expect(loggedMessages()).toEqual(['Found update to version 0.2.0'])
  })

  it('offers nothing when the release running is the latest', async () => {
    mockCommands({ check_for_update: () => null })

    await useUpdateStore.getState().checkAtLaunch()

    expect(useUpdateStore.getState().foundUpdate).toBeNull()
    expect(loggedMessages()).toEqual(['Found no update'])
  })

  it("doesn't check when automatic update checks are off", async () => {
    const checkForUpdate = vi.fn(() => NEW_VERSION)
    mockCommands({ check_for_update: checkForUpdate })
    turnOffAutomaticChecks()

    await useUpdateStore.getState().checkAtLaunch()

    expect(checkForUpdate).not.toHaveBeenCalled()
    expect(useUpdateStore.getState().foundUpdate).toBeNull()
  })

  it('says a check runs until it ends', async () => {
    let answerCheck: (foundUpdate: FoundUpdate | null) => void = () => undefined
    mockCommands({
      check_for_update: () =>
        new Promise<FoundUpdate | null>(resolve => {
          answerCheck = resolve
        })
    })

    const checked = useUpdateStore.getState().checkAtLaunch()
    expect(useUpdateStore.getState().isChecking).toBe(true)

    answerCheck(null)
    await checked
    expect(useUpdateStore.getState().isChecking).toBe(false)
  })

  it('passes over the version the user skipped', async () => {
    mockCommands({ check_for_update: () => NEW_VERSION })
    skipNewVersion()

    await useUpdateStore.getState().checkAtLaunch()

    expect(useUpdateStore.getState().foundUpdate).toBeNull()
    expect(loggedMessages()).toEqual([
      'Found update to version 0.2.0',
      'Ignored skipped update to version 0.2.0'
    ])
  })

  it('offers a version newer than the one skipped', async () => {
    const newerVersion: FoundUpdate = { ...NEW_VERSION, version: '0.3.0' }
    mockCommands({ check_for_update: () => newerVersion })
    skipNewVersion()

    await useUpdateStore.getState().checkAtLaunch()

    expect(useUpdateStore.getState().foundUpdate).toEqual(newerVersion)
  })

  it('only logs a failed check, without a notification', async () => {
    mockCommands({ check_for_update: failingCommand(CHECK_ERROR) })

    await useUpdateStore.getState().checkAtLaunch()

    expect(loggedMessages()).toEqual([`Couldn't check for updates: ${CHECK_ERROR}`])
    expect(shownNotifications()).toEqual([])
    expect(useUpdateStore.getState()).toMatchObject({ isChecking: false, foundUpdate: null })
  })
})

describe('checkByHand', () => {
  it('offers the newer release it finds', async () => {
    mockCommands({ check_for_update: () => NEW_VERSION })

    await useUpdateStore.getState().checkByHand()

    expect(useUpdateStore.getState().foundUpdate).toEqual(NEW_VERSION)
    expect(loggedMessages()).toEqual(['Found update to version 0.2.0'])
  })

  it('checks even while automatic update checks are off', async () => {
    mockCommands({ check_for_update: () => NEW_VERSION })
    turnOffAutomaticChecks()

    await useUpdateStore.getState().checkByHand()

    expect(useUpdateStore.getState().foundUpdate).toEqual(NEW_VERSION)
  })

  it('offers even the version the user skipped', async () => {
    mockCommands({ check_for_update: () => NEW_VERSION })
    skipNewVersion()

    await useUpdateStore.getState().checkByHand()

    expect(useUpdateStore.getState().foundUpdate).toEqual(NEW_VERSION)
  })

  it('says when the release running is the latest', async () => {
    mockCommands({ check_for_update: () => null })

    await useUpdateStore.getState().checkByHand()

    expect(useUpdateStore.getState().foundUpdate).toBeNull()
    expect(shownNotifications()).toEqual([
      { type: 'info', title: 'No update found', description: 'You have the latest version.' }
    ])
    expect(loggedMessages()).toEqual(['Found no update'])
  })

  it('notifies why a check failed', async () => {
    mockCommands({ check_for_update: failingCommand(CHECK_ERROR) })

    await useUpdateStore.getState().checkByHand()

    expect(shownNotifications()).toEqual([
      { type: 'error', title: "Couldn't check for updates", description: CHECK_ERROR }
    ])
    expect(useUpdateStore.getState().isChecking).toBe(false)
  })
})

const offerNewVersion = () => {
  useUpdateStore.setState({ foundUpdate: NEW_VERSION })
}

describe('openDialog', () => {
  it('opens the dialog of the update found', () => {
    offerNewVersion()

    useUpdateStore.getState().openDialog()

    expect(useUpdateStore.getState().isDialogOpen).toBe(true)
  })
})

describe('closeDialog', () => {
  it('closes the dialog and still offers the update', () => {
    offerNewVersion()
    useUpdateStore.getState().openDialog()

    useUpdateStore.getState().closeDialog()

    expect(useUpdateStore.getState()).toMatchObject({
      isDialogOpen: false,
      foundUpdate: NEW_VERSION
    })
  })

  it('keeps the dialog open while the update downloads', () => {
    offerNewVersion()
    useUpdateStore.setState({ isDialogOpen: true, isDownloading: true })

    useUpdateStore.getState().closeDialog()

    expect(useUpdateStore.getState().isDialogOpen).toBe(true)
  })
})

describe('skipUpdate', () => {
  it('stops offering the update and saves its version as skipped', async () => {
    const saveSettings = vi.fn()
    mockCommands({ save_settings: saveSettings })
    offerNewVersion()
    useUpdateStore.getState().openDialog()

    await useUpdateStore.getState().skipUpdate()

    expect(useUpdateStore.getState()).toMatchObject({ isDialogOpen: false, foundUpdate: null })
    expect(useSettingsStore.getState().settings.skipUpdateVersion).toBe('0.2.0')
    expect(saveSettings).toHaveBeenCalledOnce()
    expect(loggedMessages()).toEqual(['Skipped update to version 0.2.0'])
  })
})

describe('downloadUpdate', () => {
  it('downloads the update and closes the dialog', async () => {
    const installUpdate = vi.fn()
    mockCommands({ install_update: installUpdate })
    offerNewVersion()
    useUpdateStore.getState().openDialog()

    await useUpdateStore.getState().downloadUpdate()

    expect(installUpdate).toHaveBeenCalledOnce()
    expect(useUpdateStore.getState()).toMatchObject({ isDialogOpen: false, isDownloading: false })
  })

  it('still offers the update, until the new version runs', async () => {
    mockCommands({ install_update: () => undefined })
    offerNewVersion()

    await useUpdateStore.getState().downloadUpdate()

    expect(useUpdateStore.getState().foundUpdate).toEqual(NEW_VERSION)
  })

  it('says the update downloads until it ends', async () => {
    let finishDownload: () => void = () => undefined
    mockCommands({
      install_update: () =>
        new Promise<void>(resolve => {
          finishDownload = resolve
        })
    })
    offerNewVersion()

    const downloaded = useUpdateStore.getState().downloadUpdate()
    expect(useUpdateStore.getState().isDownloading).toBe(true)

    finishDownload()
    await downloaded
    expect(useUpdateStore.getState().isDownloading).toBe(false)
  })

  it('keeps the dialog open and notifies why the download failed', async () => {
    const downloadError =
      "Couldn't open the download in the browser: No such file or directory (os error 2)"
    mockCommands({ install_update: failingCommand(downloadError) })
    offerNewVersion()
    useUpdateStore.getState().openDialog()

    await useUpdateStore.getState().downloadUpdate()

    expect(useUpdateStore.getState()).toMatchObject({ isDialogOpen: true, isDownloading: false })
    expect(shownNotifications()).toEqual([
      { type: 'error', title: "Couldn't download the update", description: downloadError }
    ])
  })
})
