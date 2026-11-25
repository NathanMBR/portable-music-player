import { PhotoIcon } from '@heroicons/react/20/solid'
import { type ComponentType, useEffect } from 'react'
import { COVER_READ_DELAY_MS } from '../constants'
import { firstSongThatMayHaveCover } from '../coverSearch'
import { useCoverStore } from '../coverStore'
import { useHasStayedOnScreen } from '../useHasStayedOnScreen'

type CoverThumbnailProps = {
  /**
   * The songs whose covers it looks through, by their `Track.path`, in order: one for a song's row,
   * or the songs of a playlist. It shows the first cover found.
   */
  paths: readonly string[]
  /** Heroicon shown when none of the songs has a cover: a photo, or a playlist's icon. */
  placeholderIcon?: ComponentType<{ className?: string; 'aria-hidden'?: 'true' }>
}

/**
 * Square miniature of a song's embedded cover, between its play button and its title in the song
 * list, or of the first cover among several songs, like a playlist's. The library scan skips
 * covers, so each one is read from its song only once the square has stayed on screen for a
 * moment, and the rows a fast scroll flies past read nothing. Among several songs, it reads their
 * covers one after the other, without waiting again, until one has a cover. Until then, and while
 * Rust reads it, the square stays empty. When none of the songs has a cover, or its cover can't be
 * read or drawn, the square shows a placeholder icon instead: a photo, or the icon given. The cover
 * is cropped to fill the square, and is decorative: the name next to it says what it stands for.
 *
 * @summary Miniature of a song's cover, or of the first cover among several songs
 */
export const CoverThumbnail = ({
  paths,
  placeholderIcon: Placeholder = PhotoIcon
}: CoverThumbnailProps) => {
  const [hasStayedOnScreen, observeOnScreen] = useHasStayedOnScreen(COVER_READ_DELAY_MS)
  const path = useCoverStore(state => firstSongThatMayHaveCover(paths, state.covers))
  const cover = useCoverStore(state => (path === undefined ? undefined : state.covers.get(path)))
  const loadCover = useCoverStore(state => state.loadCover)
  const dropUnreadableCover = useCoverStore(state => state.dropUnreadableCover)

  // Forgotten covers, like after a new scan, are read again while their square is on screen.
  useEffect(() => {
    if (hasStayedOnScreen && path !== undefined && cover === undefined) {
      void loadCover(path)
    }
  }, [hasStayedOnScreen, path, cover, loadCover])

  return (
    <div
      ref={observeOnScreen}
      className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded bg-rule"
    >
      {path !== undefined && cover?.kind === 'shown' && (
        <img
          src={cover.url}
          alt=""
          decoding="async"
          onError={() => dropUnreadableCover(path)}
          className="size-full object-cover"
        />
      )}
      {path === undefined && <Placeholder aria-hidden="true" className="size-5 text-ink-faded" />}
    </div>
  )
}
