import { invoke } from '@tauri-apps/api/core'

export const writeLog = (message: string) => invoke<void>('write_log', { message })
