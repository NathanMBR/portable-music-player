import { EmptyLibrary } from './EmptyLibrary'
import { LibraryHeader } from './LibraryHeader'
import { useLibraryStore } from './libraryStore'
import { ScanFailure } from './ScanFailure'
import { TrackList } from './TrackList'

const LibraryContent = () => {
  const lastScan = useLibraryStore(state => state.lastScan)

  if (lastScan === null) return null
  if (lastScan.kind === 'failed') return <ScanFailure message={lastScan.message} />
  if (lastScan.tracks.length === 0) return <EmptyLibrary />
  return <TrackList tracks={lastScan.tracks} />
}

export const LibraryView = () => (
  <>
    <LibraryHeader />
    <main>
      <LibraryContent />
    </main>
  </>
)
