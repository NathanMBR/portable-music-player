import type { Track } from './types'

/** Between a song's title and its artist, wherever both are shown on one line. */
export const TITLE_ARTIST_SEPARATOR = ' · '

/** The song's file name in the Songs folder, with its extension: the same on every OS. */
export const fileNameOf = ({ path }: Track) => path.slice(path.lastIndexOf('/') + 1)

/** The song's title, followed by its artist when it names one: "Title · Artist". */
export const fullTrackName = ({ title, artist }: Track) =>
  artist ? `${title}${TITLE_ARTIST_SEPARATOR}${artist}` : title
