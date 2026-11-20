import type { Track } from './types'

/** Between a song's title and its artist, wherever both are shown on one line. */
export const TITLE_ARTIST_SEPARATOR = ' · '

/** The song's file name in the Songs folder, with its extension: the same on every OS. */
export const fileNameOf = ({ path }: Track) => path.slice(path.lastIndexOf('/') + 1)

/** A file name without its extension, the part after its last dot, unless that dot starts it. */
export const withoutExtension = (fileName: string) => {
  const extensionStart = fileName.lastIndexOf('.')
  return extensionStart > 0 ? fileName.slice(0, extensionStart) : fileName
}

/** The song's title, followed by its artist when it names one: "Title · Artist". */
export const fullTrackName = ({ title, artist }: Track) =>
  artist ? `${title}${TITLE_ARTIST_SEPARATOR}${artist}` : title
