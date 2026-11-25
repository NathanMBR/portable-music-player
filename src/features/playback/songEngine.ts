import type { Track } from '../library/types'
import { notifyError } from '../notifications/notify'
import {
  onOutputLost,
  onProgress,
  onSongEnded,
  onSongStarted,
  playSong,
  queueNextSong,
  seekSong,
  setPlaying,
  setVolume,
  stopPlayback
} from './playbackApi'
import { audibleVolume, type PlaybackSession, usePlaybackStore } from './playbackStore'
import { findTrackAfterEnd } from './playOrder'
import type { OutputLost, SongEnded, SongProgress, SongRequest, SongStarted } from './types'

/** The song in Rust's player: still being read, ready to play, or failed to. */
type CurrentSong = { id: number; path: string; status: 'reading' | 'ready' | 'failed' }

/** The song Rust was last told to play after song `afterId`: `path` is `null` for none. */
type QueuedSong = { afterId: number; path: string | null }

type PlaybackState = ReturnType<typeof usePlaybackStore.getState>

const LOST_OUTPUT_TITLE = 'Lost the sound output'

const playback = () => usePlaybackStore.getState()

const requestOf = (id: number, track: Track): SongRequest => ({
  id,
  path: track.path,
  title: track.title,
  artist: track.artist
})

/**
 * Plays the playback store's songs through Rust, for as long as the app runs, and reports their
 * length, progress and end back to the store. The store is the source of truth: Rust follows its
 * song, play state, position and volume.
 *
 * Rust always holds the song that plays once the current one ends, the same one the store's
 * `finishSong` moves to (`findTrackAfterEnd`), so it starts on the very next sample. When it does,
 * the store moves to it by the same rule, and nothing loads again. Each song Rust is given gets a
 * new id, which its events carry: an event about a song no longer in the player is ignored.
 * Returns a function that stops following the store and Rust.
 */
export const connectSongEngine = () => {
  let lastId = 0
  let current: CurrentSong | null = null
  let queued: QueuedSong | null = null
  // Every song queued after the current one, by id: Rust may start one that was replaced a moment
  // too late, and the store then catches up.
  let queuedPaths = new Map<number, string>()
  // The position Rust and the store last agreed on. When the store's differs, something other than
  // Rust moved it, like a seek or a song starting over, and Rust jumps there.
  let agreedSeconds = 0
  let sentIsPlaying: boolean | null = null
  let sentVolume: number | null = null
  // Progress sent before a jump reached Rust would show the song back where it was.
  let pendingSeeks = 0

  const fail = (track: Track, reason: unknown) => {
    if (current) {
      current.status = 'failed'
    }
    notifyError(`Couldn't play ${track.title}`, reason)
    playback().pause()
  }

  const load = async (session: PlaybackSession) => {
    const { track } = session
    lastId += 1
    const song: CurrentSong = { id: lastId, path: track.path, status: 'reading' }
    current = song
    queued = null
    queuedPaths = new Map()
    agreedSeconds = session.elapsedSeconds
    sentIsPlaying = session.isPlaying
    try {
      const details = await playSong(
        requestOf(song.id, track),
        session.elapsedSeconds,
        session.isPlaying
      )
      // Another song started, or the player was stopped, while Rust was reading this one.
      if (current !== song) {
        return
      }

      song.status = 'ready'
      queued = { afterId: song.id, path: null }
      if (details.durationSeconds !== null) {
        playback().reportDuration(details.durationSeconds)
      }
      // What changed while Rust was reading, like a pause, and the song after this one.
      followStore(playback())
    } catch (error) {
      if (current === song) {
        fail(track, error)
      }
    }
  }

  const jumpTo = (seconds: number) => {
    agreedSeconds = seconds
    pendingSeeks += 1
    void seekSong(seconds)
      .catch((error: unknown) => notifyError("Couldn't jump within the song", error))
      .finally(() => {
        pendingSeeks -= 1
      })
  }

  // Playing fails when no sound output opens: the song can be played again once one is there.
  const followPlaying = (song: CurrentSong, session: PlaybackSession) => {
    sentIsPlaying = session.isPlaying
    setPlaying(session.isPlaying).catch((error: unknown) => {
      if (current === song) {
        fail(session.track, error)
      }
    })
  }

  const followVolume = (volume: number) => {
    if (volume === sentVolume) {
      return
    }
    sentVolume = volume
    setVolume(volume).catch((error: unknown) => notifyError("Couldn't change the volume", error))
  }

  const queueAfter = (song: CurrentSong, state: PlaybackState) => {
    const { session, repeatMode } = state
    if (!session) {
      return
    }
    const upcoming = findTrackAfterEnd(session.playOrder, session.track, repeatMode)
    const path = upcoming?.path ?? null
    if (queued?.afterId === song.id && queued.path === path) {
      return
    }

    queued = { afterId: song.id, path }
    let request: SongRequest | null = null
    if (upcoming) {
      lastId += 1
      queuedPaths.set(lastId, upcoming.path)
      request = requestOf(lastId, upcoming)
    }
    // A song that can't be opened isn't queued: its failure is notified when it's its turn, since
    // the store then plays it like any other song.
    queueNextSong(song.id, request).catch(() => {})
  }

  const empty = () => {
    current = null
    queued = null
    queuedPaths = new Map()
    agreedSeconds = 0
    sentIsPlaying = null
    stopPlayback().catch((error: unknown) => notifyError("Couldn't stop the player", error))
  }

  const followStore = (state: PlaybackState) => {
    followVolume(audibleVolume(state))
    const { session } = state
    if (!session) {
      if (current) {
        empty()
      }
      return
    }

    const song = current
    const isNewSong = session.track.path !== song?.path
    const isRetry = song?.status === 'failed' && session.isPlaying
    if (isNewSong || isRetry) {
      void load(session)
      return
    }
    if (song?.status !== 'ready') {
      return
    }

    if (session.elapsedSeconds !== agreedSeconds) {
      jumpTo(session.elapsedSeconds)
    }
    if (session.isPlaying !== sentIsPlaying) {
      followPlaying(song, session)
    }
    queueAfter(song, state)
  }

  // The store moves on by the same rule Rust's queued song was chosen by, so the subscription loads
  // nothing. A store that chose otherwise, as when the queue changed at that very moment, has its
  // own choice loaded instead.
  const followStart = ({ id, durationSeconds }: SongStarted) => {
    const path = queuedPaths.get(id)
    if (path === undefined) {
      return
    }

    current = { id, path, status: 'ready' }
    queued = { afterId: id, path: null }
    queuedPaths = new Map()
    agreedSeconds = 0
    playback().finishSong()
    if (durationSeconds !== null) {
      playback().reportDuration(durationSeconds)
    }
  }

  const isCurrentAndReady = (id: number) => current?.id === id && current.status === 'ready'

  const followEnd = ({ id }: SongEnded) => {
    if (isCurrentAndReady(id)) {
      playback().finishSong()
    }
  }

  // Agreed before the store hears it, so the progress shown never makes Rust jump.
  const followProgress = ({ id, seconds }: SongProgress) => {
    if (!isCurrentAndReady(id) || pendingSeeks > 0) {
      return
    }
    agreedSeconds = seconds
    playback().reportProgress(seconds)
  }

  const followLostOutput = ({ reason }: OutputLost) => {
    if (current) {
      notifyError(LOST_OUTPUT_TITLE, reason)
      playback().pause()
    }
  }

  const listening = Promise.all([
    onSongStarted(followStart),
    onSongEnded(followEnd),
    onProgress(followProgress),
    onOutputLost(followLostOutput)
  ]).catch((error: unknown) => {
    notifyError("Couldn't follow the player", error)
    return []
  })

  followStore(playback())
  const stopFollowingStore = usePlaybackStore.subscribe(followStore)
  return () => {
    stopFollowingStore()
    void listening.then(stopListening => {
      for (const stop of stopListening) {
        stop()
      }
    })
  }
}
