import { EmptyLibrary } from '../EmptyLibrary/EmptyLibrary'
import { LibraryHeader } from '../LibraryHeader/LibraryHeader'
import { useLibraryStore } from '../libraryStore'
import { ScanFailure } from '../ScanFailure/ScanFailure'
import { TrackList } from '../TrackList/TrackList'

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
 * a new scan runs. The header stays in place and only the content below it scrolls, with the
 * scrollbar along the right edge.
 *
 * @summary Songs category view
 */
export const LibraryView = () => (
  <div className="flex h-full flex-col">
    {/* Both keep the scrollbar's width free, so the header ends where the songs end. */}
    <div className="overflow-hidden px-gutter [scrollbar-gutter:stable]">
      <LibraryHeader />
    </div>
    <main className="min-h-0 flex-1 overflow-y-auto px-gutter [scrollbar-gutter:stable]">
      <LibraryContent />
    </main>
  </div>
)
