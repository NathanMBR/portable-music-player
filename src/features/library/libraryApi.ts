import { invoke } from '@tauri-apps/api/core'
import type { MusicLibrary } from './types'

export const loadMusicLibrary = () => invoke<MusicLibrary>('load_music_library')

export const openMusicsFolder = () => invoke<void>('open_musics_folder')
