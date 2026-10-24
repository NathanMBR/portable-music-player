import type { ScanOutcome } from './types'

const formatSongCount = (count: number) =>
  count === 1 ? '1 song' : `${count.toLocaleString()} songs`

export const describeLibraryStatus = (lastScan: ScanOutcome | null, isScanning: boolean) => {
  if (isScanning) return 'Scanning…'
  if (lastScan?.kind !== 'loaded') return ''

  const { tracks, folderPath } = lastScan.library
  if (tracks.length === 0) return folderPath
  return `${formatSongCount(tracks.length)} in ${folderPath}`
}
