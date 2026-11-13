import { getCurrentWindow } from '@tauri-apps/api/window'
import { useLibraryStore } from '../library/libraryStore'
import { sortTracks } from '../library/sortTracks'
import { fileNameOf } from '../library/trackName'
import type { Track } from '../library/types'
import { notifyError } from '../notifications/notify'
import { useSettingsStore } from '../settings/settingsStore'
import type { SavedPlayback, SavedSong } from '../settings/types'
import { PLAYBACK_SAVE_DELAY_MS } from './constants'
import { type PlaybackSession, type RestoredSong, usePlaybackStore } from './playbackStore'

/** The parts of the playback store that are saved. */
type RememberedState = Pick<SavedPlayback, 'volume' | 'isMuted' | 'repeatMode' | 'isShuffled'> & {
  session: PlaybackSession | null
}

const playback = () => usePlaybackStore.getState()

const savedPlaybackOf = (state: RememberedState): SavedPlayback => {
  const { session, volume, isMuted, repeatMode, isShuffled } = state
  const song = session && {
    fileName: fileNameOf(session.track),
    elapsedSeconds: session.elapsedSeconds
  }
  return { volume, isMuted, repeatMode, isShuffled, song }
}

// A playing song's position changes a few times a second, so on its own it calls for no save: it's
// saved along with any other change, and when the window closes.
const settledStateOf = (state: RememberedState) => {
  const { song, ...choices } = savedPlaybackOf(state)
  const isPlaying = state.session?.isPlaying ?? false
  const pausedAt = isPlaying ? null : song?.elapsedSeconds
  return JSON.stringify({ ...choices, fileName: song?.fileName, isPlaying, pausedAt })
}

/** The library's songs as the Songs view sorts them, the queue a song put back plays from. */
const shownTracks = () => {
  const { lastScan } = useLibraryStore.getState()
  const { songOrder } = useSettingsStore.getState().settings
  return lastScan?.kind === 'loaded' ? sortTracks(lastScan.tracks, songOrder) : []
}

const restoredSongFrom = (song: SavedSong | null, tracks: Track[]): RestoredSong | null => {
  const track = song && tracks.find(candidate => fileNameOf(candidate) === song.fileName)
  return track ? { track, queue: tracks, elapsedSeconds: song.elapsedSeconds } : null
}

/**
 * Puts the player back as the settings saved it: the volume, mute, repeat and shuffle, and the
 * song it held, found in the library by its file name, paused where it was. A song that is no
 * longer in the Songs folder, or with no songs scanned, is saved as none and leaves the player
 * closed. Runs once the settings and the library have both loaded.
 */
export const restorePlayback = () => {
  const savedPlayback = useSettingsStore.getState().settings.playback
  const { song, ...choices } = savedPlayback
  const restoredSong = restoredSongFrom(song, shownTracks())
  playback().restore({ ...choices, song: restoredSong })
  if (song && !restoredSong) {
    void useSettingsStore.getState().savePlayback({ ...savedPlayback, song: null })
  }
}

/**
 * Saves the player's state to the settings for as long as the app runs: a moment after it changes
 * (`PLAYBACK_SAVE_DELAY_MS`), and when the window is asked to close, which waits for that save.
 * A playing song's position alone calls for no save. Returns a function that stops saving.
 */
export const connectPlaybackMemory = () => {
  let settledState = settledStateOf(playback())
  let pendingSave: ReturnType<typeof setTimeout> | null = null

  const cancelPendingSave = () => {
    if (pendingSave !== null) clearTimeout(pendingSave)
    pendingSave = null
  }

  // Never rejects, since the settings store notifies a failed save: a rejection would keep the
  // window from closing.
  const saveNow = () => {
    cancelPendingSave()
    return useSettingsStore.getState().savePlayback(savedPlaybackOf(playback()))
  }

  const followStore = (state: RememberedState) => {
    const newSettledState = settledStateOf(state)
    if (newSettledState === settledState) return

    settledState = newSettledState
    cancelPendingSave()
    pendingSave = setTimeout(saveNow, PLAYBACK_SAVE_DELAY_MS)
  }

  const stopFollowingStore = usePlaybackStore.subscribe(followStore)
  const stopWatchingClose = getCurrentWindow()
    .onCloseRequested(saveNow)
    .catch((error: unknown) => {
      notifyError("Couldn't prepare to save the player on closing", error)
      return () => {}
    })

  return () => {
    stopFollowingStore()
    cancelPendingSave()
    void stopWatchingClose.then(stopWatching => stopWatching())
  }
}
