import { invoke } from '@tauri-apps/api/core'
import type { FoundUpdate } from './types'

/** The latest stable release when it's newer than the one running, else `null`. */
export const checkForUpdate = () => invoke<FoundUpdate | null>('check_for_update')
