import type { ScanOutcome } from './types'

const formatSongCount = (count: number) =>
  count === 1 ? '1 song' : `${count.toLocaleString()} songs`

export const describeLibraryStatus = (lastScan: ScanOutcome | null, isScanning: boolean) => {
  if (isScanning) return 'Scanning…'
  if (lastScan === null) return ''
  if (lastScan.kind === 'failed') return 'Failed to check songs'
  return formatSongCount(lastScan.tracks.length)
}
