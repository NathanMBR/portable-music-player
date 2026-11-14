import { createPortal } from 'react-dom'
import { useSongDropStore } from '../songDropStore'

/**
 * Where to drop songs: while files are dragged over the window, a dashed box covering the window
 * says to drop them, over a translucent page. A drop anywhere in the window adds the songs of the
 * files and folders dropped, so the box shows as soon as the drag enters the window, and goes
 * when it leaves or drops. It stays hidden while the songs of a drop are being added, since a new
 * drop is ignored then. A drag without files, like a selected text, shows nothing.
 *
 * @summary Box showing where to drop songs while files are dragged over the window
 */
export const SongDropOverlay = () => {
  const isShown = useSongDropStore(state => state.isDragging && state.step.kind === 'idle')

  // The fragment makes react-docgen see a component, so this JSDoc reaches the docs. The portal
  // renders straight into <body>, above the side menu, which makes the app's root inert. It takes
  // no pointer events: Tauri follows the drag, not the page.
  return (
    <>
      {isShown &&
        createPortal(
          <div className="pointer-events-none fixed inset-0 z-30 p-6">
            <div className="flex size-full items-center justify-center rounded-2xl border-2 border-dashed border-pen bg-paper/85">
              <p className="text-lg font-semibold text-ink">Drop files here</p>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
