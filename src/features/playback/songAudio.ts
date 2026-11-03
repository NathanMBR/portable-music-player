import { readSong } from '../library/libraryApi'
import type { Track } from '../library/types'
import { notifyError } from '../notifications/notify'
import { type PlaybackSession, usePlaybackStore } from './playbackStore'

/** The parts of an `<audio>` element the player uses, so unit tests can stand in for one. */
export type SongAudio = Pick<
  HTMLAudioElement,
  | 'src'
  | 'currentTime'
  | 'duration'
  | 'volume'
  | 'paused'
  | 'error'
  | 'canPlayType'
  | 'play'
  | 'pause'
  | 'load'
  | 'removeAttribute'
  | 'addEventListener'
>

/** The song the audio holds: still being read by Rust, ready to play, or failed to load. */
type LoadedSong = { path: string; status: 'reading' | 'ready' | 'failed' }

/** The browser's object URLs, through which the audio plays a song's bytes from memory. */
export type ObjectUrls = Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>

type FollowedState = { session: PlaybackSession | null; volume: number }

// Every song of the library is an MP3.
const SONG_TYPE = 'audio/mpeg'

// WebKitGTK plays through GStreamer, whose good plugins hold the MP3 decoder and the audio output.
const MISSING_MP3_SUPPORT =
  "This computer can't play MP3 files. On Linux, install GStreamer's good plugins (gst-plugins-good)."

// MediaError doesn't exist outside browsers, so its codes are spelled out here.
const MEDIA_ERROR_CODES = { aborted: 1, network: 2, decode: 3, unsupported: 4 } as const

// The browsers' own messages are empty or cryptic, so each kind of failure gets a sentence.
const MEDIA_ERROR_REASONS: Record<number, string> = {
  [MEDIA_ERROR_CODES.aborted]: 'Reading the file was cut short.',
  [MEDIA_ERROR_CODES.network]: "The file couldn't be read from the drive.",
  [MEDIA_ERROR_CODES.decode]: 'The file is damaged.',
  [MEDIA_ERROR_CODES.unsupported]: "The file is missing, or this computer can't play it."
}

const UNKNOWN_MEDIA_ERROR = "The file couldn't be played."

const describeMediaError = (error: MediaError | null) =>
  (error && MEDIA_ERROR_REASONS[error.code]) ?? UNKNOWN_MEDIA_ERROR

// play() rejects with an AbortError when a newer load or a pause replaces its request: nothing
// went wrong, the audio just does something else now.
const isCutShort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

const playback = () => usePlaybackStore.getState()

/**
 * Plays the playback store's songs through `audio`, for as long as the app runs, and reports their
 * length, progress and end back to the store. The store is the source of truth: the audio follows
 * its song, play state, position and volume. Each song plays from memory, through an object URL of
 * the bytes Rust reads: WebKitGTK can't stream media from a custom URI scheme like Tauri's asset
 * protocol. Returns a function that stops following the store.
 */
export const connectSongAudio = (audio: SongAudio, objectUrls: ObjectUrls = URL) => {
  let loadedSong: LoadedSong | null = null
  // The object URL of the bytes the audio plays, freed when it lets go of the song.
  let objectUrl: string | null = null
  // The position the audio and the store last agreed on. When the store's differs, something other
  // than the audio moved it, like a seek or a song starting over, and the audio jumps there.
  let agreedSeconds = 0

  const fail = (track: Track, reason: unknown) => {
    if (loadedSong) loadedSong.status = 'failed'
    notifyError(`Couldn't play ${track.title}`, reason)
    playback().pause()
  }

  const followPlaying = (isPlaying: boolean) => {
    if (isPlaying && audio.paused) {
      audio.play().catch((error: unknown) => {
        const track = playback().session?.track
        if (track && !isCutShort(error)) fail(track, error)
      })
    } else if (!isPlaying && !audio.paused) {
      audio.pause()
    }
  }

  // Stops the audio at once, so the old song sends no more progress, and frees its bytes.
  const releaseSource = () => {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    if (objectUrl) objectUrls.revokeObjectURL(objectUrl)
    objectUrl = null
  }

  // Asked before the audio gets a source: given one GStreamer lacks the plugins for, WebKitGTK
  // freezes the whole app instead of failing with an error.
  const canPlaySongs = () => audio.canPlayType(SONG_TYPE) !== ''

  const load = async (track: Track) => {
    releaseSource()
    const song: LoadedSong = { path: track.path, status: 'reading' }
    loadedSong = song
    agreedSeconds = 0
    if (!canPlaySongs()) {
      fail(track, MISSING_MP3_SUPPORT)
      return
    }
    try {
      const bytes = await readSong(track.path)
      // Another song started, or the player was stopped, while Rust was reading this one.
      if (loadedSong !== song) return

      objectUrl = objectUrls.createObjectURL(new Blob([bytes], { type: SONG_TYPE }))
      audio.src = objectUrl
      song.status = 'ready'
      followPlaying(playback().session?.isPlaying ?? false)
    } catch (error) {
      if (loadedSong === song) fail(track, error)
    }
  }

  const jumpTo = (seconds: number) => {
    agreedSeconds = seconds
    audio.currentTime = seconds
  }

  const followStore = ({ session, volume }: FollowedState) => {
    audio.volume = volume
    if (!session) {
      if (loadedSong) releaseSource()
      loadedSong = null
      return
    }

    const isNewSong = session.track.path !== loadedSong?.path
    const isRetry = loadedSong?.status === 'failed' && session.isPlaying
    if (isNewSong || isRetry) {
      void load(session.track)
      return
    }
    if (loadedSong?.status !== 'ready') return

    if (session.elapsedSeconds !== agreedSeconds) jumpTo(session.elapsedSeconds)
    followPlaying(session.isPlaying)
  }

  audio.addEventListener('timeupdate', () => {
    // Agreed before the store hears it, so a report never makes the audio jump.
    agreedSeconds = audio.currentTime
    playback().reportProgress(audio.currentTime)
  })
  audio.addEventListener('durationchange', () => {
    playback().reportDuration(Number.isFinite(audio.duration) ? audio.duration : null)
  })
  audio.addEventListener('ended', () => playback().finishSong())
  audio.addEventListener('error', () => {
    const track = playback().session?.track
    if (track && loadedSong?.status === 'ready') fail(track, describeMediaError(audio.error))
  })

  followStore(playback())
  return usePlaybackStore.subscribe(followStore)
}
