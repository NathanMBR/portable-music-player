import { Notice } from '../../components/Notice'
import { SONGS_FOLDER_NAME } from './constants'

export const EmptyLibrary = () => (
  <Notice
    title={`Your ${SONGS_FOLDER_NAME} folder is empty`}
    description="Copy .mp3 files into it, then scan again."
  />
)
