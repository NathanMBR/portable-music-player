import type { InvokeArgs } from '@tauri-apps/api/core'
import { mockIPC } from '@tauri-apps/api/mocks'
import { recordLogMessage } from './logs'

/** Stands in for one Rust command: returns what the command would, or rejects like it would. */
export type CommandHandler = (args?: InvokeArgs) => unknown

// Logging runs behind almost every action, so it's always answered; `loggedMessages` lists what it
// wrote.
const DEFAULT_HANDLERS: Record<string, CommandHandler> = { write_log: recordLogMessage }

/**
 * Fakes the Rust side for tests and stories, where there is no Tauri runtime. Each handler answers
 * the command of the same name, and `write_log` is answered unless a handler replaces it. A command
 * without a handler rejects, so a missing mock fails loudly instead of quietly resolving to
 * `undefined`. Events go through Tauri's own mock of them, so a test can `emit` what Rust would,
 * like a window's `tauri://close-requested`.
 */
export const mockCommands = (handlers: Record<string, CommandHandler>) => {
  mockIPC(
    (command, args) => {
      const handler = handlers[command] ?? DEFAULT_HANDLERS[command]
      if (!handler) throw new Error(`Unmocked command: ${command}`)
      return handler(args)
    },
    { shouldMockEvents: true }
  )
}

/** Rust errors reach the frontend as their message string, so a failing command rejects with one. */
export const failingCommand =
  (message: string): CommandHandler =>
  () =>
    Promise.reject(message)
