import { Transition } from '@headlessui/react'
import { ArrowDownTrayIcon } from '@heroicons/react/20/solid'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fittedPathLength } from '../fittedPathLength'
import { useSongDropStore } from '../songDropStore'

const BORDER_WIDTH = 4
const BORDER_RADIUS = 24
const DASH_LENGTH = 16
const GAP_LENGTH = 12
const DASH_PATTERN_LENGTH = DASH_LENGTH + GAP_LENGTH

/** The border's `pathLength`, fitted again whenever the window, and so the border, is resized. */
const useFittedPathLength = () => {
  const borderRef = useRef<SVGRectElement>(null)
  const [pathLength, setPathLength] = useState<number>()

  useEffect(() => {
    const border = borderRef.current
    if (!border) return

    const observer = new ResizeObserver(() => {
      setPathLength(fittedPathLength(border.getTotalLength(), DASH_PATTERN_LENGTH))
    })
    observer.observe(border.ownerSVGElement ?? border)
    return () => observer.disconnect()
  }, [])

  return { borderRef, pathLength }
}

// CSS can't move a border's dashes, so this border is an SVG stroke, whose dash offset can move. A
// rect's path runs clockwise, from its top-left corner, and the march moves the dashes forward along
// it. The stroke is centered on the rect's edge, so the rect is inset by half the stroke, which then
// ends at the box's edge.
const MarchingBorder = () => {
  const { borderRef, pathLength } = useFittedPathLength()

  return (
    <div className="absolute" style={{ inset: BORDER_WIDTH / 2 }}>
      <svg aria-hidden="true" className="size-full overflow-visible text-ink">
        <rect
          ref={borderRef}
          width="100%"
          height="100%"
          rx={BORDER_RADIUS - BORDER_WIDTH / 2}
          fill="none"
          stroke="currentColor"
          strokeWidth={BORDER_WIDTH}
          strokeDasharray={`${DASH_LENGTH} ${GAP_LENGTH}`}
          strokeDashoffset={DASH_PATTERN_LENGTH}
          pathLength={pathLength}
          className="motion-safe:animate-march"
        />
      </svg>
    </div>
  )
}

/**
 * Where to drop songs: while files are dragged over the window, the whole page blurs behind
 * frosted glass, and a dashed box covering the window, its dashes marching clockwise, says to drop
 * them, with an arrow into a tray below. A drop anywhere in the window adds the songs of the files
 * and folders dropped, so the box fades in as soon as the drag enters the window, and fades out
 * when it leaves or drops. It stays hidden while the songs of a drop are being added, since a new drop is
 * ignored then. A drag without files, like a selected text, shows nothing.
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
      {createPortal(
        <Transition show={isShown}>
          <div className="pointer-events-none fixed inset-0 z-30 p-12 backdrop-blur-sm transition-opacity duration-250 ease-out data-closed:opacity-0 motion-reduce:transition-none">
            <div className="relative flex size-full flex-col items-center justify-center gap-4">
              <MarchingBorder />
              <p className="text-center text-2xl leading-none font-extrabold tracking-tight text-ink font-stretch-expanded">
                Drop files here
              </p>
              <ArrowDownTrayIcon className="size-12 text-ink" />
            </div>
          </div>
        </Transition>,
        document.body
      )}
    </>
  )
}
