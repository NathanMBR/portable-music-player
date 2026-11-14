import { FolderIcon } from '@heroicons/react/20/solid'
import { SONGS_FOLDER_NAME } from '../constants'

/**
 * Shown in place of the song list when a scan finds no `.mp3` files: in the middle of the view, a
 * folder above a large message telling the user where songs go. It fills the height its parent
 * leaves it, when that parent is a flex column, like the Songs view's content.
 *
 * @summary Notice for a Songs folder without songs
 */
export const EmptyLibrary = () => (
  <section className="flex flex-1 flex-col items-center justify-center py-8 text-center">
    <FolderIcon className="size-16 text-ink-faded" />
    <h2 className="mt-4 text-2xl leading-tight font-extrabold tracking-tight text-ink font-stretch-expanded">
      Your {SONGS_FOLDER_NAME} folder is empty
    </h2>
    <p className="mt-2 max-w-prose text-base text-ink-faded">
      Copy .mp3 files into it, then scan again.
    </p>
  </section>
)
