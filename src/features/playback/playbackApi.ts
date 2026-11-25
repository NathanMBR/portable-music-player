import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  MediaControlAction,
  OutputLost,
  SongDetails,
  SongEnded,
  SongProgress,
  SongRequest,
  SongStarted
} from './types'

// The names Rust emits its events under (`playback.rs`).
const SONG_STARTED_EVENT = 'playback:song-started'
const SONG_ENDED_EVENT = 'playback:song-ended'
const PROGRESS_EVENT = 'playback:progress'
const OUTPUT_LOST_EVENT = 'playback:output-lost'
const MEDIA_CONTROL_EVENT = 'playback:media-control'

/**
 * Plays `song` from `fromSeconds`, or holds it there paused, in place of the song in the player,
 * forgetting the one queued after it.
 */
export const playSong = (song: SongRequest, fromSeconds: number, isPlaying: boolean) =>
  invoke<SongDetails>('play_song', { song, fromSeconds, isPlaying })

/** The song to play right after song `afterId`, without a gap, or none. */
export const queueNextSong = (afterId: number, song: SongRequest | null) =>
  invoke<void>('queue_next_song', { afterId, song })

export const setPlaying = (isPlaying: boolean) => invoke<void>('set_playing', { isPlaying })

export const seekSong = (seconds: number) => invoke<void>('seek_song', { seconds })

/** From 0 (silent) to 1 (full). */
export const setVolume = (volume: number) => invoke<void>('set_volume', { volume })

/** Empties the player, which closes the sound output. */
export const stopPlayback = () => invoke<void>('stop_playback')

// Each resolves to a function that stops listening.
export const onSongStarted = (handle: (started: SongStarted) => void) =>
  listen<SongStarted>(SONG_STARTED_EVENT, event => handle(event.payload))

export const onSongEnded = (handle: (ended: SongEnded) => void) =>
  listen<SongEnded>(SONG_ENDED_EVENT, event => handle(event.payload))

export const onProgress = (handle: (progress: SongProgress) => void) =>
  listen<SongProgress>(PROGRESS_EVENT, event => handle(event.payload))

export const onOutputLost = (handle: (lost: OutputLost) => void) =>
  listen<OutputLost>(OUTPUT_LOST_EVENT, event => handle(event.payload))

export const onMediaControl = (handle: (action: MediaControlAction) => void) =>
  listen<MediaControlAction>(MEDIA_CONTROL_EVENT, event => handle(event.payload))
