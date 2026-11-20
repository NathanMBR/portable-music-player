import { StatusLine } from '../../../components/StatusLine/StatusLine'
import { describeLibraryStatus } from '../libraryStatus'
import { useLibraryStore } from '../libraryStore'

/**
 * The Songs view's status line, at the top of its content, below the header's rule: the number of
 * songs, or "Scanning…" while a scan runs. Screen readers announce it as it changes. It says
 * nothing and takes no room before the first scan, or when the empty-folder or scan failure notice
 * below it already explains why there are no songs.
 *
 * @summary Songs view status line counting the songs
 */
export const LibraryStatus = () => {
  const lastScan = useLibraryStore(state => state.lastScan)
  const isScanning = useLibraryStore(state => state.isScanning)

  return <StatusLine>{describeLibraryStatus(lastScan, isScanning)}</StatusLine>
}
