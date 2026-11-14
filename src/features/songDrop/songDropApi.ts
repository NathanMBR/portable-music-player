import { invoke } from '@tauri-apps/api/core'
import type { ConflictChoice, CopyOutcome, DroppedSongs } from './types'

/**
 * Counts the songs in the files and folders dropped on the window, given by their paths as the OS
 * gave them, and names those whose file name is taken, without copying anything.
 */
export const checkDroppedSongs = (paths: string[]) =>
  invoke<DroppedSongs>('check_dropped_songs', { paths })

/** Copies the songs of a drop into the Songs folder, flat, doing `onConflict` with taken names. */
export const copyDroppedSongs = (paths: string[], onConflict: ConflictChoice) =>
  invoke<CopyOutcome>('copy_dropped_songs', { paths, onConflict })
