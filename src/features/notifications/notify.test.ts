import { describe, expect, it, vi } from 'vitest'
import { clickNotificationAction, shownNotifications } from '../../testing/notifications'
import { notify, notifyError, notifySuccess, notifyUndoable } from './notify'

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

describe('notifySuccess', () => {
  it('shows that something went well', () => {
    notifySuccess('Song list updated', '3 songs in the Songs folder')

    expect(shownNotifications()).toEqual([
      { type: 'success', title: 'Song list updated', description: '3 songs in the Songs folder' }
    ])
  })
})

describe('notifyUndoable', () => {
  it('shows what was just done, with an Undo button', () => {
    notifyUndoable('"Road trip" deleted', vi.fn())

    expect(shownNotifications()).toEqual([
      { type: 'info', title: '"Road trip" deleted', description: undefined, action: 'Undo' }
    ])
  })

  it('takes it back when Undo is clicked', () => {
    const undo = vi.fn()
    notifyUndoable('"Road trip" deleted', undo)

    clickNotificationAction('"Road trip" deleted')

    expect(undo).toHaveBeenCalledOnce()
  })
})
