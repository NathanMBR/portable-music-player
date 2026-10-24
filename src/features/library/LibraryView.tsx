import { EmptyLibrary } from './EmptyLibrary'
import { LibraryHeader } from './LibraryHeader'
import { useLibraryStore } from './libraryStore'
import { ScanFailure } from './ScanFailure'
import { TrackList } from './TrackList'

const LibraryContent = () => {
  const lastScan = useLibraryStore(state => state.lastScan)

  if (lastScan === null) return null
  if (lastScan.kind === 'failed') return <ScanFailure message={lastScan.message} />
  if (lastScan.library.tracks.length === 0) return <EmptyLibrary />
  return <TrackList tracks={lastScan.library.tracks} />
}

export const LibraryView = () => (
  <div className="mx-auto max-w-3xl px-6">
    <LibraryHeader />
    <main>
      <LibraryContent />
    </main>
  </div>
)
