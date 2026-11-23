import { fileNameOf, withoutExtension } from '../library/trackName'
import type { Track } from '../library/types'

/** A song of a playlist, with the scanned song its file name names, or `null` if the scan lacks it. */
export type PlaylistSong = {
  fileName: string
  track: Track | null
}

// Lowercase, like the drive's file system may compare names: FAT and NTFS ignore case.
const nameKeyOf = (fileName: string) => fileName.toLowerCase()

/** Pairs each of a playlist's file names with the scanned song it names, in the playlist's order. */
export const findPlaylistSongs = (fileNames: string[], tracks: Track[]): PlaylistSong[] => {
  const trackByName = new Map(tracks.map(track => [nameKeyOf(fileNameOf(track)), track]))
  return fileNames.map(fileName => ({
    fileName,
    track: trackByName.get(nameKeyOf(fileName)) ?? null
  }))
}

/** The song's title, or for a song the scan lacks, its file name without the extension. */
export const songNameOf = ({ fileName, track }: PlaylistSong) =>
  track?.title ?? withoutExtension(fileName)

/** The songs of a playlist that can be played, in its order: those the scan found. */
export const playableTracksOf = (songs: PlaylistSong[]) => songs.flatMap(({ track }) => track ?? [])

/** The file names of the picked songs, by their paths, in the order of `tracks`. */
export const pickedFileNames = (tracks: Track[], pickedPaths: ReadonlySet<string>) =>
  tracks.filter(track => pickedPaths.has(track.path)).map(fileNameOf)

/** The paths of a playlist's songs the scan found, to start an edit with them picked. */
export const pickedPathsIn = (fileNames: string[], tracks: Track[]): ReadonlySet<string> =>
  new Set(playableTracksOf(findPlaylistSongs(fileNames, tracks)).map(track => track.path))

/**
 * A playlist's songs after an edit: those still picked keep their place, the unpicked ones leave,
 * the newly picked ones follow in the order of `tracks`, and those the scan lacks stay where they
 * are, since the picker can't show them.
 */
export const editedSongs = (
  fileNames: string[],
  tracks: Track[],
  pickedPaths: ReadonlySet<string>
) => {
  const keptSongs = findPlaylistSongs(fileNames, tracks)
    .filter(({ track }) => track === null || pickedPaths.has(track.path))
    .map(song => song.fileName)
  const alreadyThere = pickedPathsIn(fileNames, tracks)
  const addedSongs = tracks
    .filter(track => pickedPaths.has(track.path) && !alreadyThere.has(track.path))
    .map(fileNameOf)
  return [...keptSongs, ...addedSongs]
}
