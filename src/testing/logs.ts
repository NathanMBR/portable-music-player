import type { InvokeArgs } from '@tauri-apps/api/core'

const messages: string[] = []

/** Stands in for `write_log`, which every mocked Rust side answers: it keeps the message. */
export const recordLogMessage = (args?: InvokeArgs) => {
  if (args && 'message' in args && typeof args.message === 'string') messages.push(args.message)
}

/** What the frontend wrote to the log since the last reset, oldest first. */
export const loggedMessages = () => [...messages]

export const forgetLoggedMessages = () => {
  messages.length = 0
}
