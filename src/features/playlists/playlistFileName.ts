import { withoutAccents } from './plainText'

// Must match is_playlist_file_name in src-tauri/src/playlists.rs: digits, a dash, then at least one
// of A-Z, a-z, 0-9 and _, then the extension.
const PLAYLIST_EXTENSION = '.json'
const NOT_KEPT = /[^A-Za-z0-9 ]/g
const SPACES = / /g

// For a title of which nothing is kept, like one in another script.
const FALLBACK_FILE_TITLE = 'playlist'

const fileTitleOf = (title: string) =>
  withoutAccents(title).replace(NOT_KEPT, '').trim().replace(SPACES, '_') || FALLBACK_FILE_TITLE

/**
 * The name of a new playlist's file: when it was created, in milliseconds, then its title in plain
 * letters, digits and underscores, so the name is the same on every file system.
 */
export const playlistFileName = (title: string, createdAt: number) =>
  `${createdAt}-${fileTitleOf(title)}${PLAYLIST_EXTENSION}`
