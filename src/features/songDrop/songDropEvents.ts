import { type DragDropEvent, getCurrentWebview } from '@tauri-apps/api/webview'
import { notifyError } from '../notifications/notify'
import { useSongDropStore } from './songDropStore'

const followDrag = (drag: DragDropEvent) => {
  const { setDragging, dropSongs } = useSongDropStore.getState()
  switch (drag.type) {
    // A drag without paths carries no files, like a selected text.
    case 'enter':
      setDragging(drag.paths.length > 0)
      break
    case 'leave':
      setDragging(false)
      break
    case 'drop':
      setDragging(false)
      if (drag.paths.length > 0) void dropSongs(drag.paths)
      break
    // Anywhere in the window takes the drop, so where the files are doesn't matter.
    case 'over':
      break
  }
}

/**
 * Follows the files dragged over the window for as long as the app runs, through Tauri, which
 * gives their paths as the OS does: shows where to drop them while they're over the window, and
 * adds the songs of what is dropped. Returns a function that stops following them.
 */
export const connectSongDrop = () => {
  const stopFollowing = getCurrentWebview()
    .onDragDropEvent(event => followDrag(event.payload))
    .catch((error: unknown) => {
      notifyError("Couldn't watch for dropped songs", error)
      return () => {}
    })

  return () => {
    void stopFollowing.then(stop => stop())
  }
}
