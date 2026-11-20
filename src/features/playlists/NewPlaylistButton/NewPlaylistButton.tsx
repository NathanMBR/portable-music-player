import { Transition } from '@headlessui/react'
import { PlusIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import { IconButton } from '../../../components/IconButton/IconButton'
import { usePlaybackStore } from '../../playback/playbackStore'
import { NewPlaylistDialog } from '../NewPlaylistDialog/NewPlaylistDialog'
import { useIsNewPlaylistButtonShown } from '../useIsNewPlaylistButtonShown'

// It slides up and fades in like a notification, over Sonner's 400ms ease, and rides above the
// audio player with the player's own slide, 300ms ease-out, like the notifications do.
const BUTTON_CLASSES =
  'fixed right-6 z-10 rounded-full shadow-lg shadow-shade/25 transition-[opacity,translate,bottom] duration-[400ms,400ms,300ms] ease-[ease,ease,var(--ease-out)] data-closed:translate-y-4 data-closed:opacity-0 motion-reduce:transition-none'

const ABOVE_THE_PLAYER = 'bottom-[calc(var(--spacing-player)+1.5rem)]'
const ABOVE_THE_WINDOW_EDGE = 'bottom-6'

/**
 * Round button floating in the bottom-right corner while the list of playlists is on screen,
 * which opens the New playlist dialog. It slides up and fades in when the list shows, and back
 * out when another page or a playlist takes its place. It sits above the audio player while the
 * player is open, and notifications pop up above it.
 *
 * @summary Floating button opening the New playlist dialog
 */
export const NewPlaylistButton = () => {
  const isShown = useIsNewPlaylistButtonShown()
  const isPlayerOpen = usePlaybackStore(state => state.session !== null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  return (
    <>
      <Transition show={isShown}>
        <div
          className={`${BUTTON_CLASSES} ${isPlayerOpen ? ABOVE_THE_PLAYER : ABOVE_THE_WINDOW_EDGE}`}
        >
          <IconButton
            icon={PlusIcon}
            label="New playlist"
            onClick={() => setIsDialogOpen(true)}
            shape="disc"
            variant="filled"
          />
        </div>
      </Transition>
      <NewPlaylistDialog isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)} />
    </>
  )
}
