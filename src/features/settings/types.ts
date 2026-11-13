import type { RepeatMode } from '../playback/playOrder'

export type Theme = 'light' | 'dark'

/**
 * How the songs list is sorted: by file name, or by the title shown, which is the title tag or, for
 * a song without one, its file name.
 */
export type SongOrder = 'fileName' | 'title'

/** The song in the player, by its file name in the Songs folder, which is the same on every OS. */
export type SavedSong = {
  fileName: string
  elapsedSeconds: number
}

/** What the player was left with, put back when the app opens again (mirrors `SavedPlayback`). */
export type SavedPlayback = {
  /** From 0 (silent) to 1 (full): the one heard unless muted, which muting keeps. */
  volume: number
  isMuted: boolean
  repeatMode: RepeatMode
  isShuffled: boolean
  /** `null` when no song was in the player. */
  song: SavedSong | null
}

/** Mirrors `Settings` in settings.rs, saved in settings.json next to the executable. */
export type Settings = {
  /** `null` until the user picks one, which means following the OS. */
  theme: Theme | null
  /** Whether the player looks for new versions on its own. Nothing acts on it yet. */
  checksForUpdates: boolean
  songOrder: SongOrder
  playback: SavedPlayback
}
