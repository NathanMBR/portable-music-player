import { describe, expect, it } from 'vitest'
import { shownNotifications } from '../../testing/notifications'
import { notify, notifyError } from './notify'

const SAVE_ERROR =
  "Couldn't save the settings at /media/usb/settings.json: Read-only file system (os error 30)"

describe('notifyError', () => {
  it("shows Rust's message under the title", () => {
    notifyError("Couldn't save the theme", SAVE_ERROR)

    expect(shownNotifications()).toEqual([
      { type: 'error', title: "Couldn't save the theme", description: SAVE_ERROR }
    ])
  })

  it('shows the same failure once, however often it happens', () => {
    notifyError("Couldn't save the theme", SAVE_ERROR)
    notifyError("Couldn't save the theme", SAVE_ERROR)

    expect(shownNotifications()).toHaveLength(1)
  })
})

describe('notify', () => {
  it('shows a message that is not an error', () => {
    notify('Library scanned', 'The Songs folder was read again.')

    expect(shownNotifications()).toEqual([
      { type: 'info', title: 'Library scanned', description: 'The Songs folder was read again.' }
    ])
  })
})
