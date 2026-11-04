import { getCurrentWindow } from '@tauri-apps/api/window'
import { APP_NAME } from '../../constants'
import { notifyError } from '../notifications/notify'
import { type PlaybackSession, usePlaybackStore } from './playbackStore'

const titleFor = (session: PlaybackSession | null) =>
  session ? `${session.track.title} — ${APP_NAME}` : APP_NAME

/**
 * Names the window after the song in the player, playing or paused, and after the app while there
 * is none, for as long as the app runs. Returns a function that stops following the store.
 */
export const connectWindowTitle = () => {
  // The store changes a few times a second while a song plays, but the title only with the song.
  let shownTitle: string | null = null

  const followSession = ({ session }: { session: PlaybackSession | null }) => {
    const title = titleFor(session)
    if (title === shownTitle) return

    shownTitle = title
    getCurrentWindow()
      .setTitle(title)
      .catch((error: unknown) => notifyError("Couldn't change the window title", error))
  }

  followSession(usePlaybackStore.getState())
  return usePlaybackStore.subscribe(followSession)
}
