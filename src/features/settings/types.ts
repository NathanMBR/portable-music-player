export type Theme = 'light' | 'dark'

/**
 * How the songs list is sorted: by file name, or by the title shown, which is the title tag or, for
 * a song without one, its file name.
 */
export type SongOrder = 'fileName' | 'title'

/** Mirrors `Settings` in settings.rs, saved in settings.json next to the executable. */
export type Settings = {
  /** `null` until the user picks one, which means following the OS. */
  theme: Theme | null
  /** Whether the player looks for new versions on its own. Nothing acts on it yet. */
  checksForUpdates: boolean
  songOrder: SongOrder
}
