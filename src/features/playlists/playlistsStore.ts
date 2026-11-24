import { arrayMove } from '@dnd-kit/sortable'
import { create } from 'zustand'
import { compareNames } from '../../compareNames'
import { formatSongCount } from '../library/libraryStatus'
import { useLibraryStore } from '../library/libraryStore'
import { tracksOf } from '../library/scannedTracks'
import { log } from '../logging/log'
import { notifyError, notifySuccess, notifyUndoable } from '../notifications/notify'
import { playlistSource } from '../playback/playbackSource'
import { usePlaybackStore } from '../playback/playbackStore'
import { playlistFileName } from './playlistFileName'
import { findPlaylistSongs, missingSongsOf, playableTracksOf, songNameOf } from './playlistSongs'
import {
  checkPlaylistSongs,
  createPlaylistFile,
  deletePlaylistFile,
  listPlaylists,
  savePlaylistFile
} from './playlistsApi'
import type { PlaylistCheck, PlaylistContents, SavedPlaylist } from './types'

/** Whether the Playlists folder was listed: until it is, the Playlists view shows nothing. */
export type PlaylistsLoadStatus = 'loading' | 'loaded' | 'failed'

type PlaylistsStore = {
  /** Sorted by title. */
  playlists: SavedPlaylist[]
  loadStatus: PlaylistsLoadStatus
  /**
   * The file name of the playlist on screen, or `null` while the list is. It stays while other
   * pages are on screen, so coming back shows the same playlist.
   */
  shownPlaylist: string | null
  loadPlaylists: () => Promise<void>
  /** Writes a new playlist's file, and resolves to whether it was created. */
  createPlaylist: (contents: PlaylistContents) => Promise<boolean>
  /**
   * Writes a playlist's file again with new contents, keeping its name whatever the new title, and
   * resolves to whether it was saved.
   */
  editPlaylist: (fileName: string, contents: PlaylistContents) => Promise<boolean>
  showPlaylist: (fileName: string) => void
  showList: () => void
  /**
   * Looks for the playlist's songs in the Songs folder first, and plays them only if they're all
   * there: from `fromSong`, a song's file name, or else from the first song. The song list follows
   * what was found either way.
   */
  playPlaylist: (fileName: string, fromSong?: string) => Promise<void>
  /**
   * Looks for the playlist's songs again, so its plays turn on once they're all back, and the song
   * list follows what was found.
   */
  recheckPlaylist: (fileName: string) => Promise<void>
  /** Deletes the playlist's file, which the notification's Undo writes again. */
  deletePlaylist: (fileName: string) => Promise<void>
  /** Moves a song from one place to another, at once on screen, then saves the playlist. */
  moveSong: (fileName: string, from: number, to: number) => Promise<void>
  /** Takes a song out of the playlist, never out of the Songs folder; Undo puts it back. */
  removeSong: (fileName: string, songFileName: string) => Promise<void>
}

const DELETED_SINCE = 'The playlist was deleted.'

const NOT_SCANNED_YET = "Its songs aren't in the song list yet: scan the Songs folder again."

const sortByTitle = (playlists: SavedPlaylist[]) =>
  [...playlists].sort((first, second) => compareNames(first.title, second.title))

const contentsOf = ({ title, description, songs }: SavedPlaylist): PlaylistContents => ({
  title,
  description,
  songs
})

const describeMissingSongs = (missingCount: number) =>
  `${formatSongCount(missingCount)} ${missingCount === 1 ? 'is' : 'are'} missing from the Songs folder.`

const scannedTracks = () => tracksOf(useLibraryStore.getState().lastScan)

const isSameList = (first: string[], second: string[]) =>
  first.length === second.length && first.every((item, index) => item === second[index])

// Rust looks in the Songs folder on its own, the same way as the scan. When it finds other songs
// missing than the song list does, songs came or went since the last scan.
const isSongListBehind = ({ playlist, missingSongs }: PlaylistCheck) =>
  !isSameList(missingSongs, missingSongsOf(playlist.songs, scannedTracks()))

/** A song of a playlist by its title, or by its file name when the last scan lacks it. */
const nameOfSong = (songFileName: string) => {
  const [song] = findPlaylistSongs([songFileName], scannedTracks())
  return song ? songNameOf(song) : songFileName
}

/** Plays the songs of a playlist the last scan found, in its order, from `fromSong` or the first. */
const playSongsOf = (playlist: SavedPlaylist, fromSong: string | undefined) => {
  const songs = findPlaylistSongs(playlist.songs, scannedTracks())
  const queue = playableTracksOf(songs)
  const firstTrack =
    fromSong === undefined ? queue[0] : songs.find(song => song.fileName === fromSong)?.track
  if (!firstTrack) {
    notifyError(`Couldn't play "${playlist.title}"`, NOT_SCANNED_YET)
    return
  }
  usePlaybackStore.getState().playTrack(firstTrack, queue, playlistSource(playlist.fileName))
}

/** The playlist on screen, or `undefined` while the list is, as when the open one was deleted. */
export const selectShownPlaylist = ({ playlists, shownPlaylist }: PlaylistsStore) =>
  playlists.find(playlist => playlist.fileName === shownPlaylist)

export const usePlaylistsStore = create<PlaylistsStore>()((set, get) => {
  const playlistNamed = (fileName: string) =>
    get().playlists.find(playlist => playlist.fileName === fileName)

  const replacePlaylist = (changed: SavedPlaylist) =>
    set({
      playlists: get().playlists.map(playlist =>
        playlist.fileName === changed.fileName ? changed : playlist
      )
    })

  // Every search for a playlist's songs goes through here, so what it finds reaches every part of
  // the app at once: the check may rewrite the file's allSongsFound, so the store takes the
  // playlist it answers, and a song list behind it is scanned again, since the Songs view, the
  // playlists' rows and everything else showing whether a song is there read the song list.
  const lookForSongsOf = async (
    playlist: SavedPlaylist,
    failureTitle: string
  ): Promise<PlaylistCheck | null> => {
    let check: PlaylistCheck
    try {
      check = await checkPlaylistSongs(playlist.fileName)
    } catch (error) {
      notifyError(failureTitle, error)
      return null
    }
    replacePlaylist(check.playlist)
    if (isSongListBehind(check)) {
      await useLibraryStore.getState().scanAgain()
    }
    return check
  }

  // A save may rewrite the file's allSongsFound, so the store takes the playlist it answers.
  const saveSongs = async (playlist: SavedPlaylist, songs: string[]) => {
    const saved = await savePlaylistFile(playlist.fileName, { ...contentsOf(playlist), songs })
    replacePlaylist(saved)
  }

  // The song goes back where it was, or at the end if the playlist got shorter since.
  const putSongBack = async (removed: SavedPlaylist, songFileName: string, index: number) => {
    const songName = nameOfSong(songFileName)
    const failureTitle = `Couldn't put "${songName}" back in "${removed.title}"`
    const playlist = playlistNamed(removed.fileName)
    if (!playlist) {
      notifyError(failureTitle, DELETED_SINCE)
      return
    }

    const songs = [...playlist.songs]
    songs.splice(index, 0, songFileName)
    try {
      await saveSongs(playlist, songs)
      log(`Put song "${songName}" back in playlist "${playlist.title}"`)
    } catch (error) {
      notifyError(failureTitle, error)
    }
  }

  // Undoing a delete writes the same file again, so the playlist keeps its place among the files.
  const restorePlaylist = async (playlist: SavedPlaylist) => {
    try {
      const restored = await createPlaylistFile(playlist.fileName, contentsOf(playlist))
      set({ playlists: sortByTitle([...get().playlists, restored]) })
      log(`Restored playlist "${restored.title}"`)
    } catch (error) {
      notifyError(`Couldn't restore "${playlist.title}"`, error)
    }
  }

  return {
    playlists: [],
    loadStatus: 'loading',
    shownPlaylist: null,
    loadPlaylists: async () => {
      try {
        set({ playlists: sortByTitle(await listPlaylists()), loadStatus: 'loaded' })
      } catch (error) {
        notifyError("Couldn't load your playlists", error)
        set({ loadStatus: 'failed' })
      }
    },
    createPlaylist: async contents => {
      try {
        const created = await createPlaylistFile(
          playlistFileName(contents.title, Date.now()),
          contents
        )
        set({ playlists: sortByTitle([...get().playlists, created]) })
        log(`Created playlist "${created.title}" with ${formatSongCount(created.songs.length)}`)
        return true
      } catch (error) {
        notifyError(`Couldn't create "${contents.title}"`, error)
        return false
      }
    },
    editPlaylist: async (fileName, contents) => {
      const playlist = playlistNamed(fileName)
      if (!playlist) {
        notifyError(`Couldn't save "${contents.title}"`, DELETED_SINCE)
        return false
      }

      try {
        const saved = await savePlaylistFile(fileName, contents)
        set({
          playlists: sortByTitle(
            get().playlists.map(other => (other.fileName === fileName ? saved : other))
          )
        })
        log(`Edited playlist "${saved.title}"`)
        return true
      } catch (error) {
        notifyError(`Couldn't save "${playlist.title}"`, error)
        return false
      }
    },
    showPlaylist: fileName => {
      const playlist = playlistNamed(fileName)
      if (!playlist) {
        return
      }
      set({ shownPlaylist: fileName })
      log(`Opened playlist "${playlist.title}"`)
    },
    showList: () => set({ shownPlaylist: null }),
    playPlaylist: async (fileName, fromSong) => {
      const playlist = playlistNamed(fileName)
      if (!playlist) {
        return
      }

      const failureTitle = `Couldn't play "${playlist.title}"`
      const check = await lookForSongsOf(playlist, failureTitle)
      if (!check) {
        return
      }
      if (check.missingSongs.length > 0) {
        notifyError(failureTitle, describeMissingSongs(check.missingSongs.length))
        return
      }
      playSongsOf(check.playlist, fromSong)
    },
    recheckPlaylist: async fileName => {
      const playlist = playlistNamed(fileName)
      if (!playlist) {
        return
      }

      const check = await lookForSongsOf(playlist, `Couldn't check "${playlist.title}"`)
      if (!check) {
        return
      }
      if (check.missingSongs.length === 0) {
        notifySuccess(`Found every song of "${playlist.title}"`)
      } else {
        notifyError(
          `Couldn't find every song of "${playlist.title}"`,
          describeMissingSongs(check.missingSongs.length)
        )
      }
    },
    deletePlaylist: async fileName => {
      const playlist = playlistNamed(fileName)
      if (!playlist) {
        return
      }

      try {
        await deletePlaylistFile(fileName)
      } catch (error) {
        notifyError(`Couldn't delete "${playlist.title}"`, error)
        return
      }
      set({ playlists: get().playlists.filter(other => other.fileName !== fileName) })
      log(`Deleted playlist "${playlist.title}"`)
      notifyUndoable(`"${playlist.title}" deleted`, () => void restorePlaylist(playlist))
    },
    moveSong: async (fileName, from, to) => {
      const playlist = playlistNamed(fileName)
      const songFileName = playlist?.songs[from]
      if (!playlist || songFileName === undefined) {
        return
      }

      // The new order shows at once, so the dropped row doesn't jump back while Rust saves.
      const songs = arrayMove(playlist.songs, from, to)
      replacePlaylist({ ...playlist, songs })
      try {
        await saveSongs(playlist, songs)
        log(
          `Moved song "${nameOfSong(songFileName)}" to position ${to + 1} in playlist "${playlist.title}"`
        )
      } catch (error) {
        notifyError(`Couldn't save "${playlist.title}"`, error)
      }
    },
    removeSong: async (fileName, songFileName) => {
      const playlist = playlistNamed(fileName)
      if (!playlist) {
        return
      }

      const songName = nameOfSong(songFileName)
      try {
        await saveSongs(
          playlist,
          playlist.songs.filter(song => song !== songFileName)
        )
      } catch (error) {
        notifyError(`Couldn't remove "${songName}" from "${playlist.title}"`, error)
        return
      }
      log(`Removed song "${songName}" from playlist "${playlist.title}"`)
      const index = playlist.songs.indexOf(songFileName)
      notifyUndoable(
        `"${songName}" removed from "${playlist.title}"`,
        () => void putSongBack(playlist, songFileName, index)
      )
    }
  }
})
