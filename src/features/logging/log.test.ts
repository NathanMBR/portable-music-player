import { describe, expect, it, vi } from 'vitest'
import { loggedMessages } from '../../testing/logs'
import { failingCommand, mockCommands } from '../../testing/mockCommands'
import { shownNotifications } from '../../testing/notifications'
import { log } from './log'

describe('log', () => {
  it('writes each message to the log, in the order they come', () => {
    log('Changing to page "Settings"')
    log('"Search automatically for updates" is off')

    expect(loggedMessages()).toEqual([
      'Changing to page "Settings"',
      '"Search automatically for updates" is off'
    ])
  })

  it("notifies when the log can't be written", async () => {
    mockCommands({ write_log: failingCommand('The IPC channel is closed') })

    log('Changing to page "Settings"')

    await vi.waitFor(() =>
      expect(shownNotifications()).toEqual([
        {
          type: 'error',
          title: "Couldn't write to the log",
          description: 'The IPC channel is closed'
        }
      ])
    )
  })
})
