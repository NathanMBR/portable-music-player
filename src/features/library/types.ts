export type Track = {
  /** Relative to the player's folder, with `/` separators. */
  path: string
  title: string
}

export type MusicLibrary = {
  folderPath: string
  tracks: Track[]
}

export type ScanOutcome =
  | { kind: 'loaded'; library: MusicLibrary }
  | { kind: 'failed'; message: string }
