import { Button } from '../../components/Button'
import { Notice } from '../../components/Notice'
import { useLibraryStore } from './libraryStore'

type ScanFailureProps = {
  message: string
}

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
