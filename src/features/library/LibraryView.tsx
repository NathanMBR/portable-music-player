import { EmptyLibrary } from './EmptyLibrary'
import { LibraryHeader } from './LibraryHeader'
import { useLibraryStore } from './libraryStore'
import { ScanFailure } from './ScanFailure'
import { TrackList } from './TrackList'

const LibraryContent = () => {
  const lastScan = useLibraryStore(state => state.lastScan)

  if (lastScan === null) return null
  if (lastScan.kind === 'failed') return <ScanFailure />
  if (lastScan.tracks.length === 0) return <EmptyLibrary />
  return <TrackList tracks={lastScan.tracks} />
}

/**
 * The Songs category. Below the header it shows nothing until the first scan finishes, then the
 * song list, the empty-folder notice or the scan failure. The previous list stays on screen while
 * a new scan runs.
 *
 * @summary Songs category view
 */
export const LibraryView = () => (
  <>
    <LibraryHeader />
    <main>
      <LibraryContent />
    </main>
  </>
)
