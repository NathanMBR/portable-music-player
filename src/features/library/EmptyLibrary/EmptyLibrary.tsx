import { FolderIcon } from '@heroicons/react/20/solid'
import { EmptyState } from '../../../components/EmptyState/EmptyState'
import { SONGS_FOLDER_NAME } from '../constants'

/**
 * Shown in place of the song list when a scan finds no `.mp3` files: in the middle of the view, a
 * folder above a large message telling the user where songs go. It fills the height its parent
 * leaves it, when that parent is a flex column, like the Songs view's content.
 *
 * @summary Notice for a Songs folder without songs
 */
export const EmptyLibrary = () => (
  <EmptyState
    icon={FolderIcon}
    title={`Your ${SONGS_FOLDER_NAME} folder is empty`}
    description="Copy songs into it, then scan again."
  />
)
