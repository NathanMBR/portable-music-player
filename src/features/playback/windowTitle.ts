import { getCurrentWindow } from '@tauri-apps/api/window'
import { APP_NAME } from '../../constants'
import { fullTrackName, TITLE_ARTIST_SEPARATOR } from '../library/trackName'
import { notifyError } from '../notifications/notify'
import { findSourcePlaylist, usePlaylistsStore } from '../playlists/playlistsStore'
import type { SavedPlaylist } from '../playlists/types'
import { type PlaybackSession, usePlaybackStore } from './playbackStore'

// The song as the player bar names it: its title, its artist, and the playlist it plays from.
const songNameOf = (session: PlaybackSession, playlists: SavedPlaylist[]) => {
  const playlist = findSourcePlaylist(playlists, session.source)
  const trackName = fullTrackName(session.track)
  return playlist ? `${trackName}${TITLE_ARTIST_SEPARATOR}${playlist.title}` : trackName
}

const titleFor = (session: PlaybackSession | null, playlists: SavedPlaylist[]) =>
  session ? `${songNameOf(session, playlists)} — ${APP_NAME}` : APP_NAME

/**
 * Names the window after the song in the player, playing or paused, as the player bar does: its
 * title, its artist, and the playlist it plays from, which it follows as it's renamed or deleted.
 * Names it after the app while there is none, for as long as the app runs. Returns a function that
 * stops following the stores.
 */
export const connectWindowTitle = () => {
  // The store changes a few times a second while a song plays, but the title only with the song.
  let shownTitle: string | null = null

  const followPlayer = () => {
    const title = titleFor(
      usePlaybackStore.getState().session,
      usePlaylistsStore.getState().playlists
    )
    if (title === shownTitle) {
      return
    }

    shownTitle = title
    getCurrentWindow()
      .setTitle(title)
      .catch((error: unknown) => notifyError("Couldn't change the window title", error))
  }

  followPlayer()
  const stopFollowingPlayback = usePlaybackStore.subscribe(followPlayer)
  const stopFollowingPlaylists = usePlaylistsStore.subscribe(followPlayer)
  return () => {
    stopFollowingPlayback()
    stopFollowingPlaylists()
  }
}
