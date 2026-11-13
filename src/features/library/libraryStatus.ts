import type { ScanOutcome } from './types'

/** A number of songs, in the singular for one: `1 song`, `12 songs`. */
export const formatSongCount = (count: number) =>
  count === 1 ? '1 song' : `${count.toLocaleString()} songs`

export const describeLibraryStatus = (lastScan: ScanOutcome | null, isScanning: boolean) => {
  if (isScanning) return 'Scanning…'
  if (lastScan === null) return ''
  if (lastScan.kind === 'failed') return 'Failed to check songs'
  return formatSongCount(lastScan.tracks.length)
}
