import type { ScanOutcome } from './types'

/** A number of songs, in the singular for one: `1 song`, `12 songs`. */
export const formatSongCount = (count: number) =>
  count === 1 ? '1 song' : `${count.toLocaleString()} songs`

// Without songs, the view's notice below the status line says why, so the line says nothing.
export const describeLibraryStatus = (lastScan: ScanOutcome | null, isScanning: boolean) => {
  if (isScanning) return 'Scanning…'
  if (lastScan?.kind !== 'loaded' || lastScan.tracks.length === 0) return ''
  return formatSongCount(lastScan.tracks.length)
}
