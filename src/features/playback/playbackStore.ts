import { create } from 'zustand'
import type { Track } from '../library/types'
import { log } from '../logging/log'
import { formatPreciseTime } from './playbackTime'
import {
  createPlayOrder,
  findNextTrack,
  findPreviousTrack,
  nextRepeatMode,
  type RepeatMode,
  restartsOnPrevious
} from './playOrder'

/** What the time left of the progress bar shows. */
export type ShownTime = 'elapsed' | 'remaining'

/** The song loaded in the player and the queue it was played from. */
export type PlaybackSession = {
  /** The current song: a single one, so only one song plays at a time. */
  track: Track
  /** The list the song was played from, in its own order. */
  queue: Track[]
  /** The queue in the order its songs play: the queue's own order, or shuffled. */
  playOrder: Track[]
  isPlaying: boolean
  elapsedSeconds: number
  /** `null` until the song's audio has loaded its length. */
  durationSeconds: number | null
}

/** The song put back in the player when the app opens again, found among the library's songs. */
export type RestoredSong = {
  track: Track
  /** The list it plays from, as the Songs view shows it. */
  queue: Track[]
  elapsedSeconds: number
}

/** What the player is put back to when the app opens again, as it was left. */
export type RestoredPlayback = {
  volume: number
  isMuted: boolean
  repeatMode: RepeatMode
  isShuffled: boolean
  /** `null` when there was no song in the player, or it's no longer in the library. */
  song: RestoredSong | null
}

type TrackFinder = (playOrder: Track[], current: Track, repeatMode: RepeatMode) => Track | null

type PlaybackStore = {
  /** `null` while no song is loaded, which hides the player. */
  session: PlaybackSession | null
  repeatMode: RepeatMode
  isShuffled: boolean
  /** From 0 (silent) to 1 (full): the one heard unless muted, and the one unmuting brings back. */
  volume: number
  isMuted: boolean
  /**
   * The volume slider's value while it moves, heard at once but chosen only once the move ends;
   * `null` the rest of the time.
   */
  movingVolume: number | null
  shownTime: ShownTime
  playTrack: (track: Track, queue: Track[]) => void
  togglePlaying: () => void
  stop: () => void
  playNext: () => void
  playPrevious: () => void
  finishSong: () => void
  reportProgress: (elapsedSeconds: number) => void
  reportDuration: (durationSeconds: number | null) => void
  seek: (seconds: number) => void
  play: () => void
  pause: () => void
  cycleRepeatMode: () => void
  toggleShuffle: () => void
  /** Plays at the slider's volume while it moves, without choosing it yet. */
  moveVolume: (volume: number) => void
  /** Chooses the volume a move of the slider ends on: ending at silent mutes instead. */
  setVolume: (volume: number) => void
  toggleMute: () => void
  toggleShownTime: () => void
  restore: (restored: RestoredPlayback) => void
}

const FULL_VOLUME = 1
const SILENT = 0

const OTHER_SHOWN_TIME: Record<ShownTime, ShownTime> = {
  elapsed: 'remaining',
  remaining: 'elapsed'
}

// A song that starts plays from its beginning, and its length is unknown until its audio loads.
// The same song starting over keeps its length: its audio is already loaded, so none would arrive.
const startFromTheBeginning = (session: PlaybackSession, track: Track): PlaybackSession => ({
  ...session,
  track,
  isPlaying: true,
  elapsedSeconds: 0,
  durationSeconds: track.path === session.track.path ? session.durationSeconds : null
})

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

type HeardVolume = Pick<PlaybackStore, 'volume' | 'isMuted' | 'movingVolume'>

/** The volume the song plays at: the slider's while it moves, else the volume unless muted. */
export const audibleVolume = ({ volume, isMuted, movingVolume }: HeardVolume) =>
  movingVolume ?? (isMuted ? SILENT : volume)

// settings.json can be edited by hand, and the audio throws on a volume outside of 0 to 1.
const toVolume = (value: number) => clamp(value, SILENT, FULL_VOLUME)

// A song put back stays paused: the app opening shouldn't start the music on its own.
const sessionOf = ({ track, queue, elapsedSeconds }: RestoredSong, isShuffled: boolean) => ({
  track,
  queue,
  playOrder: createPlayOrder(queue, track, isShuffled),
  isPlaying: false,
  elapsedSeconds: Math.max(elapsedSeconds, 0),
  durationSeconds: null
})

type SongEvent = 'Started' | 'Paused' | 'Resumed' | 'Stopped'

// A track's title is its title tag or, for a song without one, its file name.
const logSong = (event: SongEvent, track: Track) => log(`${event} playing song "${track.title}"`)

export const usePlaybackStore = create<PlaybackStore>()((set, get) => {
  const updateSession = (change: (session: PlaybackSession) => Partial<PlaybackSession>) => {
    const { session } = get()
    if (session) set({ session: { ...session, ...change(session) } })
  }

  const start = (session: PlaybackSession, track: Track) => {
    set({ session: startFromTheBeginning(session, track) })
    logSong('Started', track)
  }

  const skipTo = (findTrack: TrackFinder) => {
    const { session, repeatMode } = get()
    if (!session) return

    const track = findTrack(session.playOrder, session.track, repeatMode)
    if (track) start(session, track)
  }

  // Only a change is logged: the audio and the media keys may ask for the state the song is in.
  const setPlaying = (isPlaying: boolean) => {
    const { session } = get()
    if (!session || session.isPlaying === isPlaying) return

    set({ session: { ...session, isPlaying } })
    logSong(isPlaying ? 'Resumed' : 'Paused', session.track)
  }

  return {
    session: null,
    repeatMode: 'off',
    isShuffled: false,
    volume: FULL_VOLUME,
    isMuted: false,
    movingVolume: null,
    shownTime: 'elapsed',
    playTrack: (track, queue) => {
      const playOrder = createPlayOrder(queue, track, get().isShuffled)
      set({
        session: {
          track,
          queue,
          playOrder,
          isPlaying: true,
          elapsedSeconds: 0,
          durationSeconds: null
        }
      })
      logSong('Started', track)
    },
    togglePlaying: () => {
      const { session } = get()
      if (session) setPlaying(!session.isPlaying)
    },
    stop: () => {
      const { session } = get()
      set({ session: null })
      if (session) logSong('Stopped', session.track)
    },
    playNext: () => skipTo(findNextTrack),
    playPrevious: () => {
      const { session } = get()
      if (session && restartsOnPrevious(session.elapsedSeconds)) {
        start(session, session.track)
      } else {
        skipTo(findPreviousTrack)
      }
    },
    finishSong: () => {
      const { session, repeatMode } = get()
      if (!session) return

      const nextTrack =
        repeatMode === 'one'
          ? session.track
          : findNextTrack(session.playOrder, session.track, repeatMode)
      if (nextTrack) {
        start(session, nextTrack)
        return
      }
      // Without a next song, the last one stays in the player, ready to play again from its start.
      set({ session: { ...session, isPlaying: false, elapsedSeconds: 0 } })
      logSong('Stopped', session.track)
    },
    reportProgress: elapsedSeconds => updateSession(() => ({ elapsedSeconds })),
    reportDuration: durationSeconds => updateSession(() => ({ durationSeconds })),
    seek: seconds => {
      const { session } = get()
      // There's nowhere to jump to before the song's audio has loaded its length.
      if (!session || session.durationSeconds === null) return

      set({ session: { ...session, elapsedSeconds: clamp(seconds, 0, session.durationSeconds) } })
    },
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    cycleRepeatMode: () => set(state => ({ repeatMode: nextRepeatMode(state.repeatMode) })),
    toggleShuffle: () => {
      const { session, isShuffled } = get()
      const isNowShuffled = !isShuffled
      set({
        isShuffled: isNowShuffled,
        session: session && {
          ...session,
          playOrder: createPlayOrder(session.queue, session.track, isNowShuffled)
        }
      })
    },
    moveVolume: movingVolume => set({ movingVolume }),
    // Keeping the volume from before a move down to silent lets unmuting bring it back.
    setVolume: volume =>
      set(
        volume === SILENT
          ? { isMuted: true, movingVolume: null }
          : { volume, isMuted: false, movingVolume: null }
      ),
    toggleMute: () => set(state => ({ isMuted: !state.isMuted, movingVolume: null })),
    toggleShownTime: () => set(state => ({ shownTime: OTHER_SHOWN_TIME[state.shownTime] })),
    restore: ({ volume, isMuted, repeatMode, isShuffled, song }) => {
      const session = song && sessionOf(song, isShuffled)
      set({
        volume: toVolume(volume),
        isMuted,
        repeatMode,
        isShuffled,
        session
      })
      if (session) {
        log(
          `Restored song "${session.track.title}" at ${formatPreciseTime(session.elapsedSeconds)}`
        )
      }
    }
  }
})
