import { invoke } from '@tauri-apps/api/core'
import type { Settings } from './types'

export const loadSettings = () => invoke<Settings>('load_settings')

export const saveSettings = (settings: Settings) => invoke<void>('save_settings', { settings })
