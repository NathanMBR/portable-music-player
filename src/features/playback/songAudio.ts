import { readSong, songSource } from '../library/libraryApi'
import type { Track } from '../library/types'
import { notifyError } from '../notifications/notify'
import { MS_PER_SECOND, POSITION_STEP_SECONDS } from './constants'
import { audibleVolume, type PlaybackSession, usePlaybackStore } from './playbackStore'
import { anchorAfterReport, estimateProgress, type TimedPosition } from './progressEstimate'

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

/** The webview's object URLs, through which the audio plays a song's bytes from memory (Windows). */
export type ObjectUrls = Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>

/** What the audio needs to play a song: the URL it streams from, or the bytes of its file. */
type PlayableSong = { url: string } | { bytes: ArrayBuffer }

type FollowedState = Parameters<typeof audibleVolume>[0] & { session: PlaybackSession | null }

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

// One step of the song's position at a time, more often than the webview's reports (every 250 ms),
// so the progress bar fills smoothly.
const PROGRESS_TICK_MS = POSITION_STEP_SECONDS * MS_PER_SECOND

const describeMediaError = (error: MediaError | null) =>
  (error && MEDIA_ERROR_REASONS[error.code]) ?? UNKNOWN_MEDIA_ERROR

// play() rejects with an AbortError when a newer load or a pause replaces its request: nothing
// went wrong, the audio just does something else now.
const isCutShort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

const playback = () => usePlaybackStore.getState()

// Rust says where a song plays from on this OS. Songs that play from memory need their bytes too.
const fetchPlayableSong = async (track: Track): Promise<PlayableSong> => {
  const source = await songSource(track.path)
  return source.kind === 'stream' ? { url: source.url } : { bytes: await readSong(track.path) }
}

/**
 * Plays the playback store's songs through `audio`, for as long as the app runs, and reports their
 * length, progress and end back to the store. The store is the source of truth: the audio follows
 * its song, play state, position and volume.
 *
 * On Linux the audio's clock can hold still for seconds and then catch up while the song plays on.
 * So once that clock is seen moving, the progress runs on with the wall clock between the audio's
 * reports (`progressEstimate.ts`), and stops whenever the audio pauses, waits for data or jumps.
 *
 * Rust decides where each song plays from (`song_source`). On Linux it streams from the song
 * server Rust runs on this computer, since WebKitGTK skips ahead in songs over 2 MiB played from
 * memory. On Windows it plays from memory, through an object URL of the bytes Rust reads. Neither
 * webview can play media from a custom URI scheme like Tauri's asset protocol. Returns a function
 * that stops following the store and the audio's clock.
 */
export const connectSongAudio = (audio: SongAudio, objectUrls: ObjectUrls = URL) => {
  let loadedSong: LoadedSong | null = null
  // The object URL of the bytes the audio plays, freed when it lets go of the song.
  let objectUrl: string | null = null
  // The position the audio and the store last agreed on. When the store's differs, something other
  // than the audio moved it, like a seek or a song starting over, and the audio jumps there.
  let agreedSeconds = 0
  // The audio's last report, and where the progress runs on from while its clock moves.
  let lastReport: TimedPosition | null = null
  let anchor: TimedPosition | null = null
  let ticker: ReturnType<typeof setInterval> | null = null

  const knownLength = () => (Number.isFinite(audio.duration) ? audio.duration : null)

  // Agreed before the store hears it, so the progress shown never makes the audio jump.
  const showProgress = (seconds: number) => {
    agreedSeconds = seconds
    playback().reportProgress(seconds)
  }

  const showEstimate = () => {
    if (!anchor || !lastReport) return
    const clock = { anchor, reportedSeconds: lastReport.seconds, durationSeconds: knownLength() }
    showProgress(estimateProgress(clock, performance.now()))
  }

  const runOnFrom = (report: TimedPosition) => {
    anchor = anchorAfterReport(anchor, report)
    ticker ??= setInterval(showEstimate, PROGRESS_TICK_MS)
  }

  const stopRunningOn = () => {
    if (ticker !== null) clearInterval(ticker)
    ticker = null
    anchor = null
    lastReport = null
  }

  const followReport = () => {
    const report = { seconds: audio.currentTime, atMs: performance.now() }
    const isClockMoving =
      !audio.paused && lastReport !== null && report.seconds > lastReport.seconds
    lastReport = report
    if (isClockMoving) runOnFrom(report)
    if (anchor) showEstimate()
    else showProgress(report.seconds)
  }

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

  // Stops the audio at once, so the old song sends no more progress, and lets go of its stream or
  // frees its bytes.
  const releaseSource = () => {
    stopRunningOn()
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    if (objectUrl) objectUrls.revokeObjectURL(objectUrl)
    objectUrl = null
  }

  // Asked before the audio gets a source: given one GStreamer lacks the plugins for, WebKitGTK
  // freezes the whole app instead of failing with an error.
  const canPlaySongs = () => audio.canPlayType(SONG_TYPE) !== ''

  // Made only for the song that is still current, so no stale song's bytes are left unfreed.
  const addressOf = (song: PlayableSong) => {
    if ('url' in song) return song.url
    objectUrl = objectUrls.createObjectURL(new Blob([song.bytes], { type: SONG_TYPE }))
    return objectUrl
  }

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
      const playableSong = await fetchPlayableSong(track)
      // Another song started, or the player was stopped, while Rust was answering for this one.
      if (loadedSong !== song) return

      audio.src = addressOf(playableSong)
      song.status = 'ready'
      // From the store's position, which isn't the start for a song put back when the app opens.
      followStore(playback())
    } catch (error) {
      if (loadedSong === song) fail(track, error)
    }
  }

  // The audio's clock starts over from where it lands, once it has read data from there.
  const jumpTo = (seconds: number) => {
    stopRunningOn()
    agreedSeconds = seconds
    audio.currentTime = seconds
  }

  const followStore = (state: FollowedState) => {
    const { session } = state
    audio.volume = audibleVolume(state)
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

  audio.addEventListener('timeupdate', followReport)
  // Whenever the audio stops playing on, so does the progress, until its clock moves again.
  for (const stop of ['pause', 'waiting', 'ended']) audio.addEventListener(stop, stopRunningOn)
  audio.addEventListener('durationchange', () => playback().reportDuration(knownLength()))
  audio.addEventListener('ended', () => playback().finishSong())
  audio.addEventListener('error', () => {
    const track = playback().session?.track
    if (track && loadedSong?.status === 'ready') fail(track, describeMediaError(audio.error))
  })

  followStore(playback())
  const stopFollowingStore = usePlaybackStore.subscribe(followStore)
  return () => {
    stopFollowingStore()
    stopRunningOn()
  }
}
