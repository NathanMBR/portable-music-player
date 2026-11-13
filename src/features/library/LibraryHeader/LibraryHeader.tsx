import { ArrowPathIcon, FolderOpenIcon } from '@heroicons/react/20/solid'
import { IconButton } from '../../../components/IconButton/IconButton'
import { ViewHeader } from '../../../components/ViewHeader/ViewHeader'
import { SONGS_FOLDER_NAME, SONGS_ICON } from '../constants'
import { describeLibraryStatus } from '../libraryStatus'
import { useLibraryStore } from '../libraryStore'

/**
 * Header of the Songs view, which stays in place while the songs scroll below it: the title, the
 * "Open folder" and "Scan again" buttons, and a status line that screen readers announce as it
 * changes. A rescan ends with a notification counting the songs, and when the file manager can't
 * open the Songs folder, a notification says why.
 *
 * @summary Songs view header with the folder and rescan actions
 */
export const LibraryHeader = () => {
  const lastScan = useLibraryStore(state => state.lastScan)
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
    >
      <p aria-live="polite" className="mt-3 min-h-5 truncate text-sm text-ink-faded">
        {describeLibraryStatus(lastScan, isScanning)}
      </p>
    </ViewHeader>
  )
}
