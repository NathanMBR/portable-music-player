import { invoke } from '@tauri-apps/api/core'
import type { SongSource, Track } from './types'

export const loadMusicLibrary = () => invoke<Track[]>('load_music_library')

export const openSongsFolder = () => invoke<void>('open_songs_folder')

/** Where the audio plays a song from on this OS, once Rust has found its file. */
export const songSource = (path: string) => invoke<SongSource>('song_source', { path })

/** The whole file of a song, as raw bytes, for the OS whose songs play from memory. */
export const readSong = (path: string) => invoke<ArrayBuffer>('read_song', { path })
