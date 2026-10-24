import { ArrowPathIcon, FolderOpenIcon } from '@heroicons/react/20/solid'
import { IconButton } from '../../components/IconButton'
import { MenuButton } from '../navigation/MenuButton'
import { SONGS_FOLDER_NAME, SONGS_ICON } from './constants'
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
      {/* A grid keeps the status lines in the title's column, whatever the button and icon sizes. */}
      <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-x-3">
        <MenuButton />
        <SONGS_ICON className="size-8 text-ink" />
        <h1 className="text-4xl leading-none font-extrabold tracking-tight font-stretch-expanded">
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
        <p
          aria-live="polite"
          className="col-span-2 col-start-3 mt-3 min-h-5 truncate text-sm text-ink-faded"
        >
          {describeLibraryStatus(lastScan, isScanning)}
        </p>
        {openFolderError && (
          <p role="alert" className="col-span-2 col-start-3 mt-1 text-sm text-correction">
            {openFolderError}
          </p>
        )}
      </div>
    </header>
  )
}
