import { Description } from '@headlessui/react'
import { useState } from 'react'
import { Button } from '../../../components/Button/Button'
import { Modal, ModalButtons, ModalTitle } from '../../../components/Modal/Modal'
import { ScrollBox } from '../../../components/ScrollBox/ScrollBox'
import { PatchNotes } from '../PatchNotes/PatchNotes'
import type { FoundUpdate } from '../types'
import { useUpdateStore } from '../updateStore'

/** The update the dialog shows, which stays the last one while the dialog fades out after a skip. */
const useShownUpdate = (foundUpdate: FoundUpdate | null) => {
  const [lastShownUpdate, setLastShownUpdate] = useState(foundUpdate)
  if (foundUpdate && foundUpdate !== lastShownUpdate) {
    setLastShownUpdate(foundUpdate)
  }
  return foundUpdate ?? lastShownUpdate
}

const UpdateChoice = ({ update }: { update: FoundUpdate }) => {
  const isDownloading = useUpdateStore(state => state.isDownloading)
  const skipUpdate = useUpdateStore(state => state.skipUpdate)
  const downloadUpdate = useUpdateStore(state => state.downloadUpdate)

  return (
    <>
      <ModalTitle>Update found!</ModalTitle>
      <Description className="mt-2 text-sm text-ink-faded">
        A new version is available. Check the changes below:
      </Description>
      <ScrollBox label={`Changes in version ${update.version}`}>
        <PatchNotes notes={update.notes} />
      </ScrollBox>
      <ModalButtons>
        <Button variant="outlined" isDisabled={isDownloading} onClick={() => void skipUpdate()}>
          Skip update
        </Button>
        <Button isDisabled={isDownloading} onClick={() => void downloadUpdate()}>
          {isDownloading ? 'Downloading update…' : 'Download update'}
        </Button>
      </ModalButtons>
    </>
  )
}

/**
 * Modal dialog over a dimmed page offering the update a check found, opened from the side menu's
 * Update option: the new version's patch notes, in a box that scrolls, then Skip update, which
 * stops offering it and saves its version as skipped, and Download update. An installed build
 * downloads and installs it, which closes the app; a portable build opens its download in the
 * browser. While it downloads, the button says so, and neither the buttons nor Escape can act. A
 * failed download keeps the dialog open and notifies why. Escape and a click outside close it,
 * and the update stays offered from the side menu.
 *
 * @summary Dialog offering the update found, with its patch notes
 */
export const UpdateDialog = () => {
  const foundUpdate = useUpdateStore(state => state.foundUpdate)
  const isDialogOpen = useUpdateStore(state => state.isDialogOpen)
  const closeDialog = useUpdateStore(state => state.closeDialog)
  const shownUpdate = useShownUpdate(foundUpdate)

  return (
    <Modal isOpen={isDialogOpen && foundUpdate !== null} onClose={closeDialog}>
      {shownUpdate && <UpdateChoice update={shownUpdate} />}
    </Modal>
  )
}
