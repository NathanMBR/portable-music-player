import { Button } from '../../components/Button'
import { Notice } from '../../components/Notice'
import { useLibraryStore } from './libraryStore'

type ScanFailureProps = {
  /** The error from Rust, shown as it is. */
  message: string
}

/**
 * Shown in place of the song list when the last scan failed: Rust's error message and a "Try
 * again" button that scans the library again.
 *
 * @summary Notice for a failed library scan
 */
export const ScanFailure = ({ message }: ScanFailureProps) => {
  const scanLibrary = useLibraryStore(state => state.scanLibrary)

  return (
    <Notice
      tone="error"
      title="Couldn't load your music"
      description={message}
      action={<Button onClick={scanLibrary}>Try again</Button>}
    />
  )
}
