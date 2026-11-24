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
