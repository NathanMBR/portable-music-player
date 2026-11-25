/**
 * A song for Rust to play or queue (mirrors `SongRequest` in `playback/engine.rs`). Its `id`, a
 * number the webview counts up, comes back in every event about it, so an event about a song no
 * longer in the player is recognizable.
 */
export type SongRequest = {
  id: number
  path: string
  title: string
  artist: string | null
}

/** What Rust read of a song it was asked to play (mirrors `SongDetails` in `playback.rs`). */
export type SongDetails = {
  /** `null` when the song doesn't say. */
  durationSeconds: number | null
}

/** The queued song took over, without a gap (mirrors `SongStarted` in `playback.rs`). */
export type SongStarted = { id: number; durationSeconds: number | null }

/** The song ended with nothing queued after it (mirrors `SongEnded` in `playback.rs`). */
export type SongEnded = { id: number }

/** Where the playing song is (mirrors `Progress` in `playback.rs`). */
export type SongProgress = { id: number; seconds: number }

/**
 * The sound output went away and no other could open, so Rust paused (mirrors `OutputLost` in
 * `playback.rs`).
 */
export type OutputLost = { reason: string }

/**
 * A media key, or a button of the system's media controls (mirrors `MediaControlAction` in
 * `playback/media_controls.rs`).
 */
export type MediaControlAction =
  | { action: 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'stop' }
  | { action: 'seek'; seconds: number }
