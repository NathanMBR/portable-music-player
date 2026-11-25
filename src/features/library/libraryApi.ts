import { invoke } from '@tauri-apps/api/core'
import type { Track } from './types'

export const loadMusicLibrary = () => invoke<Track[]>('load_music_library')

export const openSongsFolder = () => invoke<void>('open_songs_folder')

/** A song's embedded cover, as raw bytes, or `null` when it has none: Rust then sends no bytes. */
export const readCover = async (path: string) => {
  const bytes = await invoke<ArrayBuffer>('read_cover', { path })
  return bytes.byteLength > 0 ? bytes : null
}
