import { getCurrentWindow } from '@tauri-apps/api/window'
import { useLibraryStore } from '../library/libraryStore'
import { tracksOf } from '../library/scannedTracks'
import { sortTracks } from '../library/sortTracks'
import { fileNameOf } from '../library/trackName'
import type { Track } from '../library/types'
import { notifyError } from '../notifications/notify'
import { findPlaylistSongs, playableTracksOf } from '../playlists/playlistSongs'
import { findPlaylist, usePlaylistsStore } from '../playlists/playlistsStore'
import { useSettingsStore } from '../settings/settingsStore'
import type { SavedPlayback, SavedSong } from '../settings/types'
import { PLAYBACK_SAVE_DELAY_MS } from './constants'
import { type PlaybackSource, playlistSource, SONGS_SOURCE } from './playbackSource'
import { type PlaybackSession, type RestoredSong, usePlaybackStore } from './playbackStore'

/** The parts of the playback store that are saved. */
type RememberedState = Pick<SavedPlayback, 'volume' | 'isMuted' | 'repeatMode' | 'isShuffled'> & {
  session: PlaybackSession | null
}

const playback = () => usePlaybackStore.getState()

const playlistOf = (source: PlaybackSource) => (source.kind === 'playlist' ? source.fileName : null)

const savedPlaybackOf = (state: RememberedState): SavedPlayback => {
  const { session, volume, isMuted, repeatMode, isShuffled } = state
  const song = session && {
    fileName: fileNameOf(session.track),
    elapsedSeconds: session.elapsedSeconds,
    playlist: playlistOf(session.source)
  }
  return { volume, isMuted, repeatMode, isShuffled, song }
}

// A playing song's position changes a few times a second, so on its own it calls for no save: it's
// saved along with any other change, and when the window closes.
const settledStateOf = (state: RememberedState) => {
  const { song, ...choices } = savedPlaybackOf(state)
  const isPlaying = state.session?.isPlaying ?? false
  const pausedAt = isPlaying ? null : song?.elapsedSeconds
  return JSON.stringify({
    ...choices,
    fileName: song?.fileName,
    playlist: song?.playlist,
    isPlaying,
    pausedAt
  })
}

/** The library's songs as the Songs view sorts them, the queue of a song put back from there. */
const shownTracks = (tracks: Track[]) =>
  sortTracks(tracks, useSettingsStore.getState().settings.songOrder)

/** The songs the playlist named `fileName` holds, in its order, or `null` once it's gone. */
const playlistTracks = (fileName: string, tracks: Track[]) => {
  const playlist = findPlaylist(usePlaylistsStore.getState().playlists, fileName)
  return playlist ? playableTracksOf(findPlaylistSongs(playlist.songs, tracks)) : null
}

// From the playlist it was played from, while that playlist still holds it, else from the Songs
// view.
const restoredSongFrom = (song: SavedSong | null, tracks: Track[]): RestoredSong | null => {
  const track = song && tracks.find(candidate => fileNameOf(candidate) === song.fileName)
  if (!track) {
    return null
  }
  const { elapsedSeconds, playlist } = song
  const queue = playlist === null ? null : playlistTracks(playlist, tracks)
  if (playlist !== null && queue?.includes(track)) {
    return { track, queue, elapsedSeconds, source: playlistSource(playlist) }
  }
  return { track, queue: shownTracks(tracks), elapsedSeconds, source: SONGS_SOURCE }
}

/** What the settings should say once the song is back, or `null` when they already do. */
const correctedSong = (song: SavedSong | null, restored: RestoredSong | null) => {
  if (!song) {
    return null
  }
  if (!restored) {
    return { song: null }
  }
  const playlist = playlistOf(restored.source)
  return playlist === song.playlist ? null : { song: { ...song, playlist } }
}

/**
 * Puts the player back as the settings saved it: the volume, mute, repeat and shuffle, and the
 * song it held, found in the library by its file name, paused where it was, in the playlist it was
 * played from, queued with that playlist's songs, or else in the Songs view, queued as it sorts
 * them. A song that is no longer in the Songs folder, or with no songs scanned, is saved as none
 * and leaves the player closed; one whose playlist is gone, or no longer holds it, is put back in
 * the Songs view, and saved so. Runs once the settings, the library and the playlists have loaded.
 */
export const restorePlayback = () => {
  const savedPlayback = useSettingsStore.getState().settings.playback
  const { song, ...choices } = savedPlayback
  const restoredSong = restoredSongFrom(song, tracksOf(useLibraryStore.getState().lastScan))
  playback().restore({ ...choices, song: restoredSong })
  const correction = correctedSong(song, restoredSong)
  if (correction) {
    void useSettingsStore.getState().savePlayback({ ...savedPlayback, ...correction })
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
    if (pendingSave !== null) {
      clearTimeout(pendingSave)
    }
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
    if (newSettledState === settledState) {
      return
    }

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
