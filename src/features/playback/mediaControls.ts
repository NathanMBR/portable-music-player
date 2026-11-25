import { notifyError } from '../notifications/notify'
import { onMediaControl } from './playbackApi'
import { usePlaybackStore } from './playbackStore'
import type { MediaControlAction } from './types'

const playback = () => usePlaybackStore.getState()

// What the player does when a media key, or a button of the system's media controls, asks for it.
const follow = (control: MediaControlAction) => {
  switch (control.action) {
    case 'play':
      return playback().play()
    case 'pause':
      return playback().pause()
    case 'toggle':
      return playback().togglePlaying()
    case 'next':
      return playback().playNext()
    case 'previous':
      return playback().playPrevious()
    case 'stop':
      return playback().stop()
    case 'seek':
      return playback().seek(control.seconds)
  }
}

/**
 * Has the media keys and the system's media controls drive the playback store, for as long as the
 * app runs: MPRIS on Linux, Windows' media controls on Windows, both reached by Rust, which also
 * shows them the song in the player. Returns a function that stops following them.
 */
export const connectMediaControls = () => {
  const listening = onMediaControl(follow).catch((error: unknown) => {
    notifyError("Couldn't follow the media keys", error)
    return () => {}
  })
  return () => {
    void listening.then(stop => stop())
  }
}
