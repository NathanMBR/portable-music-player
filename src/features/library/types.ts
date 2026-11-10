export type Track = {
  /** Relative to the player's folder, with `/` separators. */
  path: string
  title: string
}

/**
 * Where the audio plays a song from, as Rust decides for this OS (mirrors `SongSource` in
 * `library.rs`): its URL on the song server, which streams it (Linux), or memory, through the
 * file's bytes that `read_song` sends (Windows).
 */
export type SongSource = { kind: 'stream'; url: string } | { kind: 'memory' }

/** A failed scan carries no reason: the notification it raised shows Rust's message. */
export type ScanOutcome = { kind: 'loaded'; tracks: Track[] } | { kind: 'failed' }
