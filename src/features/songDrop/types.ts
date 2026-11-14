/**
 * What to do with a dropped song whose file name is already taken in the Songs folder (mirrors
 * `ConflictChoice` in `song_drop.rs`): leave the song already there, or put the dropped one in its
 * place.
 */
export type ConflictChoice = 'skip' | 'replace'

/** A dropped file or folder Rust couldn't read or copy (mirrors `DropFailure` in `song_drop.rs`). */
export type DropFailure = {
  /** As the OS gave it, absolute. */
  path: string
  reason: string
}

/** What a drop holds, before anything is copied (mirrors `DroppedSongs` in `song_drop.rs`). */
export type DroppedSongs = {
  /** The MP3s found in the files and folders dropped, subfolders included. */
  songCount: number
  /**
   * The file names of the dropped songs whose name is taken, by a song of the Songs folder or by
   * another dropped song before them.
   */
  conflicts: string[]
  failures: DropFailure[]
}

/** What copying a drop did (mirrors `CopyOutcome` in `song_drop.rs`). */
export type CopyOutcome = {
  copiedCount: number
  failures: DropFailure[]
}
