import { create } from 'zustand'
import type { Track } from '../library/types'
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

type TrackFinder = (playOrder: Track[], current: Track, repeatMode: RepeatMode) => Track | null

type PlaybackStore = {
  /** `null` while no song is loaded, which hides the player. */
  session: PlaybackSession | null
  repeatMode: RepeatMode
  isShuffled: boolean
  /** From 0 (silent) to 1 (full). */
  volume: number
  /** The volume that unmuting brings back, `null` unless muted from the speaker button. */
  volumeBeforeMuting: number | null
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
  pause: () => void
  cycleRepeatMode: () => void
  toggleShuffle: () => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  toggleShownTime: () => void
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

export const usePlaybackStore = create<PlaybackStore>()((set, get) => {
  const updateSession = (change: (session: PlaybackSession) => Partial<PlaybackSession>) => {
    const { session } = get()
    if (session) set({ session: { ...session, ...change(session) } })
  }

  const skipTo = (findTrack: TrackFinder) => {
    const { session, repeatMode } = get()
    if (!session) return

    const track = findTrack(session.playOrder, session.track, repeatMode)
    if (track) set({ session: startFromTheBeginning(session, track) })
  }

  return {
    session: null,
    repeatMode: 'off',
    isShuffled: false,
    volume: FULL_VOLUME,
    volumeBeforeMuting: null,
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
    },
    togglePlaying: () => updateSession(session => ({ isPlaying: !session.isPlaying })),
    stop: () => set({ session: null }),
    playNext: () => skipTo(findNextTrack),
    playPrevious: () => {
      const { session } = get()
      if (session && restartsOnPrevious(session.elapsedSeconds)) {
        set({ session: startFromTheBeginning(session, session.track) })
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
      // Without a next song, the last one stays in the player, ready to play again from its start.
      set({
        session: nextTrack
          ? startFromTheBeginning(session, nextTrack)
          : { ...session, isPlaying: false, elapsedSeconds: 0 }
      })
    },
    reportProgress: elapsedSeconds => updateSession(() => ({ elapsedSeconds })),
    reportDuration: durationSeconds => updateSession(() => ({ durationSeconds })),
    seek: seconds => {
      const { session } = get()
      // There's nowhere to jump to before the song's audio has loaded its length.
      if (!session || session.durationSeconds === null) return

      set({ session: { ...session, elapsedSeconds: clamp(seconds, 0, session.durationSeconds) } })
    },
    pause: () => updateSession(() => ({ isPlaying: false })),
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
    // A volume chosen on the slider replaces the one from before muting.
    setVolume: volume => set({ volume, volumeBeforeMuting: null }),
    toggleMute: () => {
      const { volume, volumeBeforeMuting } = get()
      set(
        volume === SILENT
          ? { volume: volumeBeforeMuting ?? FULL_VOLUME, volumeBeforeMuting: null }
          : { volume: SILENT, volumeBeforeMuting: volume }
      )
    },
    toggleShownTime: () => set(state => ({ shownTime: OTHER_SHOWN_TIME[state.shownTime] }))
  }
})
