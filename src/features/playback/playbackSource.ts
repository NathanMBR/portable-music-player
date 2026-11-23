/** The list the song in the player was played from: the Songs view, or one playlist. */
export type PlaybackSource = { kind: 'songs' } | { kind: 'playlist'; fileName: string }

/** The Songs view, with every scanned song. */
export const SONGS_SOURCE: PlaybackSource = { kind: 'songs' }

/** The playlist saved under `fileName`, which identifies it whatever its title. */
export const playlistSource = (fileName: string): PlaybackSource => ({
  kind: 'playlist',
  fileName
})

/** Whether two sources are the same list: the Songs view, or the same playlist. */
export const isSameSource = (first: PlaybackSource, second: PlaybackSource) =>
  first.kind === 'playlist'
    ? second.kind === 'playlist' && second.fileName === first.fileName
    : second.kind === first.kind
