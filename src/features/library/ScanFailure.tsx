import { Button } from '../../components/Button'
import { Notice } from '../../components/Notice'
import { useLibraryStore } from './libraryStore'

/**
 * Shown in place of the song list when the last scan failed: a calm notice and a "Try again"
 * button that scans the library again. Rust's reason is in the notification the failed scan
 * raised.
 *
 * @summary Notice for a failed library scan
 */
export const ScanFailure = () => {
  const scanLibrary = useLibraryStore(state => state.scanLibrary)

  return (
    <Notice
      title="Couldn't load your music"
      description="Check that the drive is still connected, then try again."
      action={<Button onClick={scanLibrary}>Try again</Button>}
    />
  )
}
