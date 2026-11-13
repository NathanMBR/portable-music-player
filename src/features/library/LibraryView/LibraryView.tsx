import { useMemo } from 'react'
import { ViewLayout } from '../../../components/ViewLayout/ViewLayout'
import { useSettingsStore } from '../../settings/settingsStore'
import { EmptyLibrary } from '../EmptyLibrary/EmptyLibrary'
import { LibraryHeader } from '../LibraryHeader/LibraryHeader'
import { useLibraryStore } from '../libraryStore'
import { ScanFailure } from '../ScanFailure/ScanFailure'
import { sortTracks } from '../sortTracks'
import { TrackList } from '../TrackList/TrackList'
import type { Track } from '../types'

// Sorted here rather than in the store, so a new song order applies at once, and the settings
// restored after the first scan still sort its songs.
const SortedTrackList = ({ tracks }: { tracks: Track[] }) => {
  const songOrder = useSettingsStore(state => state.settings.songOrder)
  const sortedTracks = useMemo(() => sortTracks(tracks, songOrder), [tracks, songOrder])
  return <TrackList tracks={sortedTracks} />
}

const LibraryContent = () => {
  const lastScan = useLibraryStore(state => state.lastScan)

  if (lastScan === null) return null
  if (lastScan.kind === 'failed') return <ScanFailure />
  if (lastScan.tracks.length === 0) return <EmptyLibrary />
  return <SortedTrackList tracks={lastScan.tracks} />
}

/**
 * The Songs category. Below the header it shows nothing until the first scan finishes, then the
 * song list, the empty-folder notice or the scan failure. The previous list stays on screen while
 * a new scan runs. The header stays in place and only the content below it scrolls, with the
 * scrollbar beside it in the right margin.
 *
 * @summary Songs category view
 */
export const LibraryView = () => (
  <ViewLayout header={<LibraryHeader />}>
    <LibraryContent />
  </ViewLayout>
)
