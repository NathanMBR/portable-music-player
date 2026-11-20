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
