import { create } from 'zustand'
import { notifyError } from '../notifications/notify'
import { MAX_CACHED_COVERS } from './constants'
import { readCover } from './libraryApi'

/**
 * What a song's row shows in its cover's square: nothing yet while Rust reads the cover, the cover
 * through an object URL of its bytes, or the placeholder when the song has none.
 */
export type Cover = { kind: 'reading' } | { kind: 'shown'; url: string } | { kind: 'missing' }

type CoverStore = {
  /** The covers asked for, by track path, the one asked for longest ago first. */
  covers: Map<string, Cover>
  /** Reads a song's cover from Rust, unless it was already asked for. */
  loadCover: (path: string) => Promise<void>
  /** Shows the placeholder in place of a cover whose bytes the webview can't draw. */
  dropUnreadableCover: (path: string) => void
  /** Frees every cover, so each is read again from its song when its row is next on screen. */
  forgetCovers: () => void
}

// Keyed by its title, so when a pulled drive fails every cover on screen at once, one notification
// shows the latest reason instead of one popping up per row.
const COVER_FAILURE_TITLE = "Couldn't load a cover"

const NO_COVER: Cover = { kind: 'missing' }

// The webview finds the image's format from its bytes, so the blob needs no type.
const shownCover = (bytes: ArrayBuffer): Cover => ({
  kind: 'shown',
  url: URL.createObjectURL(new Blob([bytes]))
})

const free = (cover: Cover) => {
  if (cover.kind === 'shown') URL.revokeObjectURL(cover.url)
}

// A copy of `covers` with room for one more, freeing the ones asked for longest ago: a Map keeps
// the order its keys were added in.
const withRoomForOne = (covers: Map<string, Cover>) => {
  const kept = new Map(covers)
  for (const [path, cover] of kept) {
    if (kept.size < MAX_CACHED_COVERS) break
    free(cover)
    kept.delete(path)
  }
  return kept
}

export const useCoverStore = create<CoverStore>()((set, get) => {
  // Replacing a cover keeps its place in the order the covers were asked for.
  const setCover = (path: string, cover: Cover) =>
    set({ covers: new Map(get().covers).set(path, cover) })

  return {
    covers: new Map(),
    loadCover: async path => {
      if (get().covers.has(path)) return

      const reading: Cover = { kind: 'reading' }
      set({ covers: withRoomForOne(get().covers).set(path, reading) })
      // Forgotten, or freed for newer covers, while Rust was reading it.
      const isStillWanted = () => get().covers.get(path) === reading
      try {
        const bytes = await readCover(path)
        if (isStillWanted()) setCover(path, bytes ? shownCover(bytes) : NO_COVER)
      } catch (error) {
        if (!isStillWanted()) return
        notifyError(COVER_FAILURE_TITLE, error)
        setCover(path, NO_COVER)
      }
    },
    dropUnreadableCover: path => {
      const cover = get().covers.get(path)
      if (cover?.kind !== 'shown') return

      free(cover)
      setCover(path, NO_COVER)
    },
    forgetCovers: () => {
      for (const cover of get().covers.values()) free(cover)
      set({ covers: new Map() })
    }
  }
})
