export type Track = {
  /** Relative to the player's folder, with `/` separators. */
  path: string
  title: string
}

/** A failed scan carries no reason: the notification it raised shows Rust's message. */
export type ScanOutcome = { kind: 'loaded'; tracks: Track[] } | { kind: 'failed' }
