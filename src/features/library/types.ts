export type Track = {
  /** Relative to the player's folder, with `/` separators. */
  path: string
  title: string
}

export type ScanOutcome = { kind: 'loaded'; tracks: Track[] } | { kind: 'failed'; message: string }
