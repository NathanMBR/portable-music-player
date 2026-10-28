import { Notice } from '../../components/Notice'
import { SONGS_FOLDER_NAME } from './constants'

/**
 * Shown in place of the song list when a scan finds no `.mp3` files, telling the user where songs
 * go.
 *
 * @summary Notice for a Songs folder without songs
 */
export const EmptyLibrary = () => (
  <Notice
    title={`Your ${SONGS_FOLDER_NAME} folder is empty`}
    description="Copy .mp3 files into it, then scan again."
  />
)
