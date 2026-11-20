import { create } from 'zustand'
import { compareNames } from '../../compareNames'
import { formatSongCount } from '../library/libraryStatus'
import { useLibraryStore } from '../library/libraryStore'
import { log } from '../logging/log'
import { notifyError, notifySuccess, notifyUndoable } from '../notifications/notify'
import { usePlaybackStore } from '../playback/playbackStore'
import { playlistFileName } from './playlistFileName'
import { findPlaylistSongs, playableTracksOf } from './playlistSongs'
import {
  checkPlaylistSongs,
  createPlaylistFile,
  deletePlaylistFile,
  listPlaylists
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
  showPlaylist: (fileName: string) => void
  showList: () => void
  /**
   * Looks for the playlist's songs in the Songs folder first, and plays them only if they're all
   * there: from `fromSong`, a song's file name, or else from the first song.
   */
  playPlaylist: (fileName: string, fromSong?: string) => Promise<void>
  /** Looks for the playlist's songs again, so its plays turn on once they're all back. */
  recheckPlaylist: (fileName: string) => Promise<void>
  /** Deletes the playlist's file, which the notification's Undo writes again. */
  deletePlaylist: (fileName: string) => Promise<void>
}

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

const scannedTracks = () => {
  const { lastScan } = useLibraryStore.getState()
  return lastScan?.kind === 'loaded' ? lastScan.tracks : []
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
  usePlaybackStore.getState().playTrack(firstTrack, queue)
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

  // The check may rewrite the file's allSongsFound, so the store takes the playlist it answers.
  const checkOrNotify = async (
    playlist: SavedPlaylist,
    failureTitle: string
  ): Promise<PlaylistCheck | null> => {
    try {
      const check = await checkPlaylistSongs(playlist.fileName)
      replacePlaylist(check.playlist)
      return check
    } catch (error) {
      notifyError(failureTitle, error)
      return null
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
      const check = await checkOrNotify(playlist, failureTitle)
      if (!check) {
        return
      }
      if (check.missingCount > 0) {
        notifyError(failureTitle, describeMissingSongs(check.missingCount))
        return
      }
      playSongsOf(check.playlist, fromSong)
    },
    recheckPlaylist: async fileName => {
      const playlist = playlistNamed(fileName)
      if (!playlist) {
        return
      }

      const check = await checkOrNotify(playlist, `Couldn't check "${playlist.title}"`)
      if (!check) {
        return
      }
      if (check.missingCount === 0) {
        notifySuccess(`Found every song of "${playlist.title}"`)
      } else {
        notifyError(
          `Couldn't find every song of "${playlist.title}"`,
          describeMissingSongs(check.missingCount)
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
    }
  }
})
