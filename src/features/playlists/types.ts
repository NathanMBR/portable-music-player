/** A playlist and the name of its file (mirrors `SavedPlaylist` in `playlists.rs`). */
export type SavedPlaylist = {
  /** `<Date.now()>-<normalized title>.json`, in the Playlists folder next to the executable. */
  fileName: string
  title: string
  /** Empty when the playlist has none. */
  description: string
  /**
   * Whether every song was in the Songs folder when Rust last looked for them: when the playlist
   * was created or saved, or checked before playing. A listing or a scan never changes it. The app
   * shows what the last scan says instead, and this only until the first scan ends.
   */
  allSongsFound: boolean
  /** The songs' file names in the Songs folder, with their extension, in the playlist's order. */
  songs: string[]
}

/**
 * What creating or saving a playlist sends (mirrors `PlaylistContents` in `playlists.rs`): Rust
 * works out `allSongsFound` itself.
 */
export type PlaylistContents = Pick<SavedPlaylist, 'title' | 'description' | 'songs'>

/**
 * A playlist as checking it left it, and the file names of its songs that are missing, in its
 * order (mirrors `PlaylistCheck` in `playlists.rs`).
 */
export type PlaylistCheck = {
  playlist: SavedPlaylist
  missingSongs: string[]
}
