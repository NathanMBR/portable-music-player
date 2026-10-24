import { ArrowPathIcon } from '@heroicons/react/20/solid'
import { IconButton } from '../../components/IconButton'
import { MUSICS_FOLDER_NAME } from './constants'
import { describeLibraryStatus } from './libraryStatus'
import { useLibraryStore } from './libraryStore'

export const LibraryHeader = () => {
  const lastScan = useLibraryStore(state => state.lastScan)
  const isScanning = useLibraryStore(state => state.isScanning)
  const scanLibrary = useLibraryStore(state => state.scanLibrary)

  return (
    <header className="sticky top-0 border-b-2 border-ink bg-paper pt-8 pb-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-4xl leading-none font-extrabold tracking-tight font-stretch-expanded">
          {MUSICS_FOLDER_NAME}
        </h1>
        <IconButton
          icon={ArrowPathIcon}
          label="Scan again"
          isBusy={isScanning}
          onClick={scanLibrary}
        />
      </div>
      <p aria-live="polite" className="mt-3 min-h-5 truncate text-sm text-ink-faded">
        {describeLibraryStatus(lastScan, isScanning)}
      </p>
    </header>
  )
}
