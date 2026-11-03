import { invoke } from '@tauri-apps/api/core'
import type { Track } from './types'

export const loadMusicLibrary = () => invoke<Track[]>('load_music_library')

export const openSongsFolder = () => invoke<void>('open_songs_folder')

/** The whole file of a song, as raw bytes. */
export const readSong = (path: string) => invoke<ArrayBuffer>('read_song', { path })
