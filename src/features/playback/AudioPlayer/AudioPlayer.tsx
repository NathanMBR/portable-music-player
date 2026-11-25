import { Transition } from '@headlessui/react'
import { useState } from 'react'
import { Marquee } from '../../../components/Marquee/Marquee'
import { TrackName } from '../../library/TrackName/TrackName'
import { TITLE_ARTIST_SEPARATOR } from '../../library/trackName'
import { findPlaylist, usePlaylistsStore } from '../../playlists/playlistsStore'
import { PlaybackControls } from '../PlaybackControls/PlaybackControls'
import { type PlaybackSession, usePlaybackStore } from '../playbackStore'
import { findNextTrack, findPreviousTrack, restartsOnPrevious } from '../playOrder'
import { SongProgress } from '../SongProgress/SongProgress'
import { VolumeSlider } from '../VolumeSlider/VolumeSlider'

// Stop clears the session at once, but the player takes a moment to slide away: it keeps showing
// the last song meanwhile instead of going blank.
const useSessionShownWhileClosing = (session: PlaybackSession | null) => {
  const [lastSession, setLastSession] = useState(session)
  if (session !== null && session !== lastSession) {
    setLastSession(session)
  }
  return session ?? lastSession
}

/** The song's name, then, played from a playlist, a middle dot and the playlist's title. */
const SongName = ({ session }: { session: PlaybackSession }) => {
  const { source } = session
  const playlist = usePlaylistsStore(state =>
    source.kind === 'playlist' ? findPlaylist(state.playlists, source.fileName) : undefined
  )

  return (
    <>
      <TrackName track={session.track} />
      {playlist && (
        <span className="font-stretch-semi-condensed text-ink-faded">
          {TITLE_ARTIST_SEPARATOR}
          {playlist.title}
        </span>
      )}
    </>
  )
}

const PlayerContent = ({ session }: { session: PlaybackSession }) => {
  const repeatMode = usePlaybackStore(state => state.repeatMode)
  const { track, playOrder } = session

  return (
    <>
      <PlaybackControls
        isPlaying={session.isPlaying}
        canGoBack={
          restartsOnPrevious(session.elapsedSeconds) ||
          findPreviousTrack(playOrder, track, repeatMode) !== null
        }
        hasNextSong={findNextTrack(playOrder, track, repeatMode) !== null}
      />
      {/* The progress grows up to a set width only: a longer bar is harder to follow, so in wide
          windows the player spreads the space left between its three parts instead. */}
      <div className="min-w-0 max-w-xl flex-1">
        <SongProgress
          songName={
            <Marquee isSliding={session.isPlaying}>
              <SongName session={session} />
            </Marquee>
          }
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
 * when the category changes. It holds the controls on the left, the song's name and progress in
 * the middle, and the volume on the right. The name is the song's title, then, when its tags name
 * one, a middle dot and its artist in a lighter ink, as in the song list, and, for a song played
 * from a playlist, another middle dot and the playlist's title, in the artist's type and ink. While
 * the song plays, it slides from right to left without end above the progress, from the start of
 * the left time's digits to the end of the length's (`Marquee`), whatever its length, coming in
 * again from the right one second after it starts going off on the left; while it's paused, the
 * name holds still in the middle, cut with an ellipsis when it's too long. Hovering the song's part
 * shows it whole. The progress stops growing at a set width, so in wide windows the spaces around
 * it widen instead. The songs themselves play in Rust, through `songEngine.ts`, which follows the
 * same playback store.
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
