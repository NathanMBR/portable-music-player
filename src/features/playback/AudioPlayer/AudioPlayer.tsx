import { Transition } from '@headlessui/react'
import { useState } from 'react'
import { PlaybackControls } from '../PlaybackControls/PlaybackControls'
import { type PlaybackSession, usePlaybackStore } from '../playbackStore'
import { findNextTrack, findPreviousTrack } from '../playOrder'
import { SongProgress } from '../SongProgress/SongProgress'
import { VolumeSlider } from '../VolumeSlider/VolumeSlider'

// Stop clears the session at once, but the player takes a moment to slide away: it keeps showing
// the last song meanwhile instead of going blank.
const useSessionShownWhileClosing = (session: PlaybackSession | null) => {
  const [lastSession, setLastSession] = useState(session)
  if (session !== null && session !== lastSession) setLastSession(session)
  return session ?? lastSession
}

const PlayerContent = ({ session }: { session: PlaybackSession }) => {
  const repeatMode = usePlaybackStore(state => state.repeatMode)
  const { track, playOrder } = session

  return (
    <>
      <PlaybackControls
        isPlaying={session.isPlaying}
        hasPreviousSong={findPreviousTrack(playOrder, track, repeatMode) !== null}
        hasNextSong={findNextTrack(playOrder, track, repeatMode) !== null}
      />
      {/* The progress grows up to a set width only: a longer bar is harder to follow, so in wide
          windows the player spreads the space left between its three parts instead. */}
      <div className="min-w-0 max-w-xl flex-1">
        <p
          aria-live="polite"
          className="mb-1 truncate text-center font-semibold font-stretch-semi-condensed"
        >
          {track.title}
        </p>
        <SongProgress
          elapsedSeconds={session.elapsedSeconds}
          durationSeconds={session.durationSeconds}
        />
      </div>
      <VolumeSlider />
    </>
  )
}

/**
 * The bar at the bottom of the window that plays the songs. It slides up when a song is played
 * and away when it's stopped. The app shell renders it outside the views, so a song keeps playing
 * when the category changes. It holds the controls on the left, the song's title and progress in
 * the middle, and the volume on the right. The progress stops growing at a set width, so in wide
 * windows the spaces around it widen instead. No audio plays yet: it only shows the playback state.
 *
 * @summary Audio player bar at the bottom of the window
 */
export const AudioPlayer = () => {
  const session = usePlaybackStore(state => state.session)
  const shownSession = useSessionShownWhileClosing(session)

  return (
    <Transition show={session !== null}>
      <section
        aria-label="Player"
        className="fixed inset-x-0 bottom-0 flex h-player items-center justify-between gap-6 border-t border-ink bg-paper px-6 transition duration-300 ease-out data-closed:translate-y-full motion-reduce:transition-none"
      >
        {shownSession && <PlayerContent session={shownSession} />}
      </section>
    </Transition>
  )
}
