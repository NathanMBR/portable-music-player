import type { Track } from '../library/types'
import type { PlaybackSource } from './playbackSource'
import { isInPlayerFrom, usePlaybackStore } from './playbackStore'

/**
 * Whether the song in the player, playing or paused, is `track` played from `source`, the list
 * asking: a list shows its song as current only when the song plays from that list.
 */
export const useIsInPlayerFrom = (track: Track | null, source: PlaybackSource) =>
  usePlaybackStore(state => isInPlayerFrom(state.session, track, source))
