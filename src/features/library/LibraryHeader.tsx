import { ArrowPathIcon, FolderOpenIcon } from '@heroicons/react/20/solid'
import { IconButton } from '../../components/IconButton'
import { SONGS_FOLDER_NAME, SONGS_ICON } from './constants'
import { describeLibraryStatus } from './libraryStatus'
import { useLibraryStore } from './libraryStore'

/**
 * Sticky header of the Songs view: the title, the "Open folder" and "Scan again" buttons, and a
 * status line that screen readers announce as it changes. When the file manager can't open the
 * Songs folder, a notification says why.
 *
 * @summary Songs view header with the folder and rescan actions
 */
export const LibraryHeader = () => {
  const lastScan = useLibraryStore(state => state.lastScan)
  const isScanning = useLibraryStore(state => state.isScanning)
  const scanLibrary = useLibraryStore(state => state.scanLibrary)
  const openFolder = useLibraryStore(state => state.openFolder)

  return (
    <header className="sticky top-0 border-b-2 border-ink bg-paper pt-8 pb-4">
      {/* min-h-10 matches the menu button's height, so the two line up across their columns. */}
      <div className="flex min-h-10 items-center gap-3">
        <SONGS_ICON className="size-8 text-ink" />
        <h1 className="flex-1 text-4xl leading-none font-extrabold tracking-tight font-stretch-expanded">
          {SONGS_FOLDER_NAME}
        </h1>
        <div className="flex gap-1">
          <IconButton icon={FolderOpenIcon} label="Open folder" onClick={openFolder} />
          <IconButton
            icon={ArrowPathIcon}
            label="Scan again"
            isBusy={isScanning}
            onClick={scanLibrary}
          />
        </div>
      </div>
      <p aria-live="polite" className="mt-3 min-h-5 truncate text-sm text-ink-faded">
        {describeLibraryStatus(lastScan, isScanning)}
      </p>
    </header>
  )
}
