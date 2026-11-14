import { ArrowPathIcon, FolderOpenIcon } from '@heroicons/react/20/solid'
import { IconButton } from '../../../components/IconButton/IconButton'
import { ViewHeader } from '../../../components/ViewHeader/ViewHeader'
import { SONGS_FOLDER_NAME, SONGS_ICON } from '../constants'
import { useLibraryStore } from '../libraryStore'

/**
 * Header of the Songs view, which stays in place while the songs scroll below it: the title and the
 * "Open folder" and "Scan again" buttons. A rescan ends with a notification counting the songs, and
 * when the file manager can't open the Songs folder, a notification says why.
 *
 * @summary Songs view header with the folder and rescan actions
 */
export const LibraryHeader = () => {
  const isScanning = useLibraryStore(state => state.isScanning)
  const scanLibrary = useLibraryStore(state => state.scanLibrary)
  const openFolder = useLibraryStore(state => state.openFolder)

  return (
    <ViewHeader
      icon={SONGS_ICON}
      title={SONGS_FOLDER_NAME}
      actions={
        <div className="flex gap-1">
          <IconButton icon={FolderOpenIcon} label="Open folder" onClick={openFolder} />
          <IconButton
            icon={ArrowPathIcon}
            label="Scan again"
            isBusy={isScanning}
            onClick={scanLibrary}
          />
        </div>
      }
    />
  )
}
