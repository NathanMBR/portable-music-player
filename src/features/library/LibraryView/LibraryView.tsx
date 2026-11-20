import { ViewLayout } from '../../../components/ViewLayout/ViewLayout'
import { EmptyLibrary } from '../EmptyLibrary/EmptyLibrary'
import { LibraryHeader } from '../LibraryHeader/LibraryHeader'
import { LibraryStatus } from '../LibraryStatus/LibraryStatus'
import { useLibraryStore } from '../libraryStore'
import { ScanFailure } from '../ScanFailure/ScanFailure'
import { useSortedTracks } from '../scannedTracks'
import { TrackList } from '../TrackList/TrackList'
import type { Track } from '../types'

const SortedTrackList = ({ tracks }: { tracks: Track[] }) => (
  <TrackList tracks={useSortedTracks(tracks)} />
)

const LibraryContent = () => {
  const lastScan = useLibraryStore(state => state.lastScan)

  if (lastScan === null) {
    return null
  }
  if (lastScan.kind === 'failed') {
    return <ScanFailure />
  }
  if (lastScan.tracks.length === 0) {
    return <EmptyLibrary />
  }
  return <SortedTrackList tracks={lastScan.tracks} />
}

/**
 * The Songs category. Below the header's rule, the status line counts the songs, and below it the
 * view shows nothing until the first scan finishes, then the song list, the scan failure, or the
 * empty-folder notice in the middle of the view. The previous list stays on screen while a new
 * scan runs. The header stays in place and only the content below it scrolls, with the scrollbar
 * beside it in the right margin.
 *
 * @summary Songs category view
 */
export const LibraryView = () => (
  <ViewLayout header={<LibraryHeader />}>
    {/* At least as tall as the view, so the empty-folder notice can sit in its middle. */}
    <div className="flex min-h-full flex-col">
      <LibraryStatus />
      <LibraryContent />
    </div>
  </ViewLayout>
)
