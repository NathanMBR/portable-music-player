import { create } from 'zustand'
import { formatSongCount } from '../library/libraryStatus'
import { useLibraryStore } from '../library/libraryStore'
import { log } from '../logging/log'
import { notify, notifyError } from '../notifications/notify'
import { checkDroppedSongs, copyDroppedSongs } from './songDropApi'
import type { ConflictChoice, DropFailure, DroppedSongs } from './types'

/** Where adding a drop's songs is: the dialog shows every step but `idle`. */
export type SongDropStep =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'asking'; paths: string[]; droppedSongs: DroppedSongs }
  | { kind: 'copying'; songCount: number }

type SongDropStore = {
  /** Whether files are dragged over the window, which shows where to drop them. */
  isDragging: boolean
  step: SongDropStep
  setDragging: (isDragging: boolean) => void
  /**
   * Adds the songs of the files and folders dropped, by their paths as the OS gave them: checks
   * them, asks what to do when file names are taken, copies them and scans the Songs folder again.
   * Ignored while the songs of another drop are being added.
   */
  dropSongs: (paths: string[]) => Promise<void>
  /** Answers the question about taken names by copying, doing `choice` with those songs. */
  copyTakenNames: (choice: ConflictChoice) => Promise<void>
  /** Answers the question about taken names by copying nothing. */
  cancel: () => void
}

const DROP_FAILURE_TITLE = "Couldn't add the dropped songs"
const PARTIAL_FAILURE_TITLE = "Couldn't add some of the dropped files"

const IDLE: SongDropStep = { kind: 'idle' }

// The first failure says why, and the count says how far it went, like a drive filling up.
const notifyFailures = (title: string, [firstFailure, ...otherFailures]: DropFailure[]) => {
  if (!firstFailure) return

  const firstReason = `${firstFailure.path}: ${firstFailure.reason}`
  const othersCount = otherFailures.length
  notifyError(title, othersCount === 0 ? firstReason : `${firstReason}, and ${othersCount} more`)
}

const tellNothingToAdd = ({ failures }: DroppedSongs) => {
  if (failures.length > 0) notifyFailures(DROP_FAILURE_TITLE, failures)
  else notify('No songs to add', 'Only MP3 files can be added to the Songs folder')
}

const untilScanEnds = () =>
  new Promise<void>(resolve => {
    if (!useLibraryStore.getState().isScanning) return resolve()
    const stopWatching = useLibraryStore.subscribe(({ isScanning }) => {
      if (isScanning) return
      stopWatching()
      resolve()
    })
  })

// A scan already running, like the one at launch on a slow drive, may have listed the Songs folder
// before the copy, and a scan asked for meanwhile would be ignored.
const scanAfterTheRunningOne = async () => {
  await untilScanEnds()
  await useLibraryStore.getState().scanLibrary()
}

const songCountCopied = ({ songCount, conflicts }: DroppedSongs, choice: ConflictChoice) =>
  choice === 'skip' ? songCount - conflicts.length : songCount

export const useSongDropStore = create<SongDropStore>()((set, get) => {
  const copySongs = async (paths: string[], onConflict: ConflictChoice, songCount: number) => {
    set({ step: { kind: 'copying', songCount } })
    try {
      const { copiedCount, failures } = await copyDroppedSongs(paths, onConflict)
      log(`Copied ${formatSongCount(copiedCount)} to the Songs folder`)
      notifyFailures(PARTIAL_FAILURE_TITLE, failures)
      await scanAfterTheRunningOne()
    } catch (error) {
      notifyError(DROP_FAILURE_TITLE, error)
    }
    set({ step: IDLE })
  }

  const checkDrop = async (paths: string[]) => {
    try {
      return await checkDroppedSongs(paths)
    } catch (error) {
      notifyError(DROP_FAILURE_TITLE, error)
      return null
    }
  }

  return {
    isDragging: false,
    step: IDLE,
    setDragging: isDragging => set({ isDragging }),
    dropSongs: async paths => {
      if (get().step.kind !== 'idle') return

      set({ step: { kind: 'checking' } })
      const droppedSongs = await checkDrop(paths)
      if (droppedSongs === null) return set({ step: IDLE })

      log(`Dropped ${formatSongCount(droppedSongs.songCount)}`)
      if (droppedSongs.songCount === 0) {
        tellNothingToAdd(droppedSongs)
        set({ step: IDLE })
      } else if (droppedSongs.conflicts.length > 0) {
        set({ step: { kind: 'asking', paths, droppedSongs } })
      } else {
        await copySongs(paths, 'skip', droppedSongs.songCount)
      }
    },
    copyTakenNames: async choice => {
      const { step } = get()
      if (step.kind !== 'asking') return

      await copySongs(step.paths, choice, songCountCopied(step.droppedSongs, choice))
    },
    cancel: () => {
      if (get().step.kind === 'asking') set({ step: IDLE })
    }
  }
})
