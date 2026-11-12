import type { Track } from '../library/types'
import { type PlaybackSession, usePlaybackStore } from './playbackStore'

const playback = () => usePlaybackStore.getState()

// Every seekto carries a seekTime: the type leaves it optional only because other actions don't.
const seekTo: MediaSessionActionHandler = ({ seekTime }) => {
  if (seekTime !== undefined) playback().seek(seekTime)
}

// What the player does when the OS's media controls, like the keyboard's media keys, ask for it.
const ACTION_HANDLERS: [MediaSessionAction, MediaSessionActionHandler][] = [
  ['play', () => playback().play()],
  ['pause', () => playback().pause()],
  ['stop', () => playback().stop()],
  ['nexttrack', () => playback().playNext()],
  ['previoustrack', () => playback().playPrevious()],
  ['seekto', seekTo]
]

// A song without an artist leaves it out, so the media session keeps its default: blank.
const metadataFor = (track: Track | null) =>
  track && new MediaMetadata({ title: track.title, artist: track.artist ?? undefined })

const playbackStateOf = (session: PlaybackSession | null): MediaSessionPlaybackState => {
  if (!session) return 'none'
  return session.isPlaying ? 'playing' : 'paused'
}

// Hands the song in the player to the OS through the webview's media session, for as long as the
// app runs: WebView2 passes it on to Windows' media controls, WebKitGTK to MPRIS on Linux. Both
// read the song's position from its <audio> element, which follows the store, so it isn't set
// here. Returns a function that stops following the store.
export const connectMediaSession = () => {
  // WebKitGTK builds it in by default only from 2.46 on.
  if (!('mediaSession' in navigator)) return () => {}

  const { mediaSession } = navigator
  for (const [action, handler] of ACTION_HANDLERS) mediaSession.setActionHandler(action, handler)

  // The store changes a few times a second while a song plays, but these only with the song and
  // its play state. Both start as the media session's own defaults.
  let shownTrack: Track | null = null
  let shownState: MediaSessionPlaybackState = 'none'

  const showTrack = (track: Track | null) => {
    if (track === shownTrack) return
    shownTrack = track
    mediaSession.metadata = metadataFor(track)
  }

  const showPlaybackState = (state: MediaSessionPlaybackState) => {
    if (state === shownState) return
    shownState = state
    mediaSession.playbackState = state
  }

  const followSession = ({ session }: { session: PlaybackSession | null }) => {
    showTrack(session?.track ?? null)
    showPlaybackState(playbackStateOf(session))
  }

  followSession(playback())
  return usePlaybackStore.subscribe(followSession)
}
