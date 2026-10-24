import { ArrowPathIcon, FolderOpenIcon } from '@heroicons/react/20/solid'
import { IconButton } from '../../components/IconButton'
import { MenuButton } from '../navigation/MenuButton'
import { SONGS_FOLDER_NAME } from './constants'
import { describeLibraryStatus } from './libraryStatus'
import { useLibraryStore } from './libraryStore'
import { useOpenSongsFolder } from './useOpenSongsFolder'

export const LibraryHeader = () => {
  const lastScan = useLibraryStore(state => state.lastScan)
  const isScanning = useLibraryStore(state => state.isScanning)
  const scanLibrary = useLibraryStore(state => state.scanLibrary)
  const { openFolder, openFolderError } = useOpenSongsFolder()

  return (
    <header className="sticky top-0 border-b-2 border-ink bg-paper pt-8 pb-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <MenuButton />
          <h1 className="text-4xl leading-none font-extrabold tracking-tight font-stretch-expanded">
            {SONGS_FOLDER_NAME}
          </h1>
        </div>
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
      {/* Indented by the menu button's width plus the gap, so the status lines up with the title. */}
      <p aria-live="polite" className="mt-3 ml-14 min-h-5 truncate text-sm text-ink-faded">
        {describeLibraryStatus(lastScan, isScanning)}
      </p>
      {openFolderError && (
        <p role="alert" className="mt-1 ml-14 text-sm text-correction">
          {openFolderError}
        </p>
      )}
    </header>
  )
}
