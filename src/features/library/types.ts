/**
 * A song of the library, as the scan reads it from its file and tags (mirrors `Track` in
 * `library.rs`).
 */
export type Track = {
  /** Relative to the player's folder, with `/` separators. */
  path: string
  /** The title tag, or the file name without its extension when the song has none. */
  title: string
  /**
   * The artist tag, or the album artist when it's missing, with several artists joined by `, `;
   * `null` when the song names none.
   */
  artist: string | null
}

/** A failed scan carries no reason: the notification it raised shows Rust's message. */
export type ScanOutcome = { kind: 'loaded'; tracks: Track[] } | { kind: 'failed' }
