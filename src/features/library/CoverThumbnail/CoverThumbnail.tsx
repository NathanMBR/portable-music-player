import { PhotoIcon } from '@heroicons/react/20/solid'
import { useEffect } from 'react'
import { COVER_READ_DELAY_MS } from '../constants'
import { useCoverStore } from '../coverStore'
import { useIsOnScreen } from '../useIsOnScreen'

type CoverThumbnailProps = {
  /** The song whose cover it shows, by its `Track.path`. */
  path: string
}

/**
 * Square miniature of a song's embedded cover, between its play button and its title in the song
 * list. The library scan skips covers, so each one is read from its song only once the square has
 * stayed on screen for a moment, and the rows a fast scroll flies past read nothing. Until then,
 * and while Rust reads it, the square stays empty. A song without a cover, or whose cover can't be
 * read or drawn, shows a photo icon instead. The cover is cropped to fill the square, and is
 * decorative: the title next to it names the song.
 *
 * @summary Miniature of a song's cover
 */
export const CoverThumbnail = ({ path }: CoverThumbnailProps) => {
  const [isOnScreen, observeOnScreen] = useIsOnScreen()
  const cover = useCoverStore(state => state.covers.get(path))
  const loadCover = useCoverStore(state => state.loadCover)
  const dropUnreadableCover = useCoverStore(state => state.dropUnreadableCover)
  // Forgotten covers, like after a new scan, are read again while their square is on screen.
  const isUnread = cover === undefined

  // Read only once the square has stayed on screen, so a fast scroll doesn't read every song.
  useEffect(() => {
    if (!isOnScreen || !isUnread) return

    const reading = setTimeout(() => void loadCover(path), COVER_READ_DELAY_MS)
    return () => clearTimeout(reading)
  }, [isOnScreen, isUnread, path, loadCover])

  return (
    <div
      ref={observeOnScreen}
      className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded bg-rule"
    >
      {cover?.kind === 'shown' && (
        <img
          src={cover.url}
          alt=""
          decoding="async"
          onError={() => dropUnreadableCover(path)}
          className="size-full object-cover"
        />
      )}
      {cover?.kind === 'missing' && (
        <PhotoIcon aria-hidden="true" className="size-5 text-ink-faded" />
      )}
    </div>
  )
}
