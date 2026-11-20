import { invoke } from '@tauri-apps/api/core'
import type { PlaylistCheck, PlaylistContents, SavedPlaylist } from './types'

/** Every valid playlist of the Playlists folder, in the order of their file names. */
export const listPlaylists = () => invoke<SavedPlaylist[]>('list_playlists')

/** Writes a new playlist file, never over an existing one. */
export const createPlaylistFile = (fileName: string, playlist: PlaylistContents) =>
  invoke<SavedPlaylist>('create_playlist', { fileName, playlist })

/** Writes an existing playlist's file again, working out whether its songs are all found. */
export const savePlaylistFile = (fileName: string, playlist: PlaylistContents) =>
  invoke<SavedPlaylist>('save_playlist', { fileName, playlist })

/** Looks for the playlist's songs in the Songs folder, saving whether they were all found. */
export const checkPlaylistSongs = (fileName: string) =>
  invoke<PlaylistCheck>('check_playlist', { fileName })

export const deletePlaylistFile = (fileName: string) =>
  invoke<void>('delete_playlist', { fileName })
