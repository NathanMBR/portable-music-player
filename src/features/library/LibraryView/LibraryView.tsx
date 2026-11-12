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

// The songs keep the width between the gutters, like the header. Their scroll area stops inside
// the right gutter, so its scrollbar sits there, a small gap away from the songs. The scrollbar is
// always there, only hidden while the songs all fit, so they never widen: WebKitGTK ignores
// scrollbar-gutter, which would keep its room otherwise.
const SONGS_COLUMN_CLASSES =
  'overflow-y-scroll pl-gutter pr-3 mr-[calc(var(--spacing-gutter)_-_var(--spacing-scrollbar)_-_var(--spacing)_*_3)]'

/**
 * The Songs category. Below the header it shows nothing until the first scan finishes, then the
 * song list, the empty-folder notice or the scan failure. The previous list stays on screen while
 * a new scan runs. The header stays in place and only the content below it scrolls, with the
 * scrollbar beside it in the right margin.
 *
 * @summary Songs category view
 */
export const LibraryView = () => (
  <div className="flex h-full flex-col">
    <div className="px-gutter">
      <LibraryHeader />
    </div>
    <main className={`min-h-0 flex-1 ${SONGS_COLUMN_CLASSES}`}>
      <LibraryContent />
    </main>
  </div>
)
