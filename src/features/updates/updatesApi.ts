import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import type { FoundUpdate } from './types'

/** The latest stable release when it's newer than the one running, else `null`. */
export const checkForUpdate = () => invoke<FoundUpdate | null>('check_for_update')

/**
 * Gets the update the last check found: an installed build downloads and installs it, which closes
 * the app, and a portable build opens its download in the default browser.
 */
export const installUpdate = () => invoke<void>('install_update')

/** Opens a link of the patch notes in the default browser, so the webview never leaves the app. */
export const openLink = (url: string) => openUrl(url)
