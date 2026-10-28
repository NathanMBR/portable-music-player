import type { InvokeArgs } from '@tauri-apps/api/core'
import { mockIPC } from '@tauri-apps/api/mocks'

/** Stands in for one Rust command: returns what the command would, or rejects like it would. */
export type CommandHandler = (args?: InvokeArgs) => unknown

/**
 * Fakes the Rust side for tests and stories, where there is no Tauri runtime. Each handler answers
 * the command of the same name. A command without a handler rejects, so a missing mock fails loudly
 * instead of quietly resolving to `undefined`.
 */
export const mockCommands = (handlers: Record<string, CommandHandler>) => {
  mockIPC((command, args) => {
    const handler = handlers[command]
    if (!handler) throw new Error(`Unmocked command: ${command}`)
    return handler(args)
  })
}

/** Rust errors reach the frontend as their message string, so a failing command rejects with one. */
export const failingCommand =
  (message: string): CommandHandler =>
  () =>
    Promise.reject(message)
