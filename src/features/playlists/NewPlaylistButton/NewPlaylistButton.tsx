import { Transition } from '@headlessui/react'
import { PlusIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import { IconButton } from '../../../components/IconButton/IconButton'
import { usePlaybackStore } from '../../playback/playbackStore'
import { PlaylistDialog } from '../PlaylistDialog/PlaylistDialog'
import { useIsNewPlaylistButtonShown } from '../useIsNewPlaylistButtonShown'

// It slides up from below the window over a notification's time and curve, Sonner's 400ms ease,
// and rides above the audio player with the player's own slide, 300ms ease-out, like the
// notifications do. It has no z-index: coming after the views, it floats over them, and coming
// before the player, it slides in from behind it.
const BUTTON_CLASSES =
  'fixed right-6 rounded-full shadow-lg shadow-shade/25 transition-[translate,bottom] duration-[400ms,300ms] ease-[ease,var(--ease-out)] motion-reduce:transition-none'

/** Where the button floats while shown, and how far down it waits while hidden. */
type Placement = { shown: string; hidden: string }

// Hidden, it waits wholly below the window's bottom edge: down its own height, the gap below it,
// and the half rem its shadow reaches above it, plus the player's height while the player is open.
const ABOVE_THE_WINDOW_EDGE: Placement = {
  shown: 'bottom-6',
  hidden: 'data-closed:translate-y-[calc(100%+2rem)]'
}
const ABOVE_THE_PLAYER: Placement = {
  shown: 'bottom-[calc(var(--spacing-player)+1.5rem)]',
  hidden: 'data-closed:translate-y-[calc(100%+var(--spacing-player)+2rem)]'
}

/**
 * Round button floating in the bottom-right corner while the list of playlists is on screen,
 * which opens the New playlist dialog. It slides up from below the window's bottom edge when the
 * list shows, without fading, and back down out of the window when another page or a playlist
 * takes its place. It sits above the audio player while the player is open, sliding in from
 * behind it, and notifications pop up above it.
 *
 * @summary Floating button opening the New playlist dialog
 */
export const NewPlaylistButton = () => {
  const isShown = useIsNewPlaylistButtonShown()
  const isPlayerOpen = usePlaybackStore(state => state.session !== null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const placement = isPlayerOpen ? ABOVE_THE_PLAYER : ABOVE_THE_WINDOW_EDGE

  return (
    <>
      <Transition show={isShown}>
        <div className={`${BUTTON_CLASSES} ${placement.shown} ${placement.hidden}`}>
          <IconButton
            icon={PlusIcon}
            label="New playlist"
            onClick={() => setIsDialogOpen(true)}
            shape="disc"
            variant="filled"
          />
        </div>
      </Transition>
      <PlaylistDialog isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)} />
    </>
  )
}
