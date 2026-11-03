import { create } from 'zustand'
import type { Track } from '../library/types'
import {
  createPlayOrder,
  findNextTrack,
  findPreviousTrack,
  nextRepeatMode,
  type RepeatMode
} from './playOrder'

/** What the time left of the progress bar shows. */
export type ShownTime = 'elapsed' | 'remaining'

/** The song loaded in the player and the queue it was played from. No audio plays yet. */
export type PlaybackSession = {
  /** The current song: a single one, so only one song plays at a time. */
  track: Track
  /** The list the song was played from, in its own order. */
  queue: Track[]
  /** The queue in the order its songs play: the queue's own order, or shuffled. */
  playOrder: Track[]
  isPlaying: boolean
  elapsedSeconds: number
  /** `null` until the song's audio is loaded. */
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
const PLAYING_FROM_THE_START = {
  isPlaying: true,
  elapsedSeconds: 0,
  durationSeconds: null
} as const

export const usePlaybackStore = create<PlaybackStore>()((set, get) => {
  const skipTo = (findTrack: TrackFinder) => {
    const { session, repeatMode } = get()
    if (!session) return

    const track = findTrack(session.playOrder, session.track, repeatMode)
    if (track) set({ session: { ...session, track, ...PLAYING_FROM_THE_START } })
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
      set({ session: { track, queue, playOrder, ...PLAYING_FROM_THE_START } })
    },
    togglePlaying: () => {
      const { session } = get()
      if (session) set({ session: { ...session, isPlaying: !session.isPlaying } })
    },
    stop: () => set({ session: null }),
    playNext: () => skipTo(findNextTrack),
    playPrevious: () => skipTo(findPreviousTrack),
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
