import { Description, Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { ArrowPathIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import { Button } from '../../../components/Button/Button'
import { formatSongCount } from '../../library/libraryStatus'
import { type SongDropStep, useSongDropStore } from '../songDropStore'
import { listTakenNames, summarizeTakenNames } from '../takenNames'
import type { DroppedSongs } from '../types'

type ShownStep = Exclude<SongDropStep, { kind: 'idle' }>

const TITLE_CLASSES = 'text-base font-semibold text-ink'

/** The step the dialog shows, which stays the last one while the dialog fades out after it. */
const useShownStep = (step: SongDropStep) => {
  const [lastShownStep, setLastShownStep] = useState<ShownStep | null>(null)
  if (step.kind !== 'idle' && step !== lastShownStep) setLastShownStep(step)
  return step.kind === 'idle' ? lastShownStep : step
}

const BusyStep = ({ message }: { message: string }) => (
  <>
    <DialogTitle className={TITLE_CLASSES}>Adding songs</DialogTitle>
    <div className="mt-4 flex items-center gap-3">
      <ArrowPathIcon className="size-5 shrink-0 text-pen motion-safe:animate-spin" />
      <Description aria-live="polite" className="text-sm text-ink-faded">
        {message}
      </Description>
    </div>
  </>
)

const TakenNamesList = ({ conflicts }: { conflicts: string[] }) => {
  const { listedNames, unlistedCount } = listTakenNames(conflicts)
  return (
    <ul className="mt-3 rounded-md border border-rule px-3 py-2 text-sm text-ink">
      {listedNames.map(name => (
        <li key={name} className="truncate py-0.5">
          {name}
        </li>
      ))}
      {unlistedCount > 0 && <li className="py-0.5 text-ink-faded">and {unlistedCount} more</li>}
    </ul>
  )
}

const TakenNamesQuestion = ({ droppedSongs }: { droppedSongs: DroppedSongs }) => {
  const copyTakenNames = useSongDropStore(state => state.copyTakenNames)
  const cancel = useSongDropStore(state => state.cancel)

  return (
    <>
      <DialogTitle className={TITLE_CLASSES}>Replace songs with the same name?</DialogTitle>
      <Description className="mt-2 text-sm text-ink-faded">
        {summarizeTakenNames(droppedSongs)}
      </Description>
      <TakenNamesList conflicts={droppedSongs.conflicts} />
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="quiet" onClick={cancel}>
          Cancel
        </Button>
        <Button variant="outlined" onClick={() => void copyTakenNames('replace')}>
          Replace them
        </Button>
        <Button onClick={() => void copyTakenNames('skip')}>Skip them</Button>
      </div>
    </>
  )
}

const StepContent = ({ step }: { step: ShownStep }) => {
  switch (step.kind) {
    case 'checking':
      return <BusyStep message="Looking for songs…" />
    case 'copying':
      return (
        <BusyStep message={`Copying ${formatSongCount(step.songCount)} to the Songs folder…`} />
      )
    case 'asking':
      return <TakenNamesQuestion droppedSongs={step.droppedSongs} />
  }
}

/**
 * Modal dialog over a dimmed page while the songs of a drop are added: a loader while they're
 * looked for, then while they're copied and the Songs folder is scanned again. When file names of
 * the drop are taken, it first asks what to do with those songs, naming a few: skip them, replace
 * the songs already there, or cancel, which copies nothing. Escape and a click outside cancel only
 * that question: songs being copied can't be stopped.
 *
 * @summary Dialog adding dropped songs, asking about taken file names
 */
export const SongDropDialog = () => {
  const step = useSongDropStore(state => state.step)
  const cancel = useSongDropStore(state => state.cancel)
  const shownStep = useShownStep(step)

  return (
    <Dialog open={step.kind !== 'idle'} onClose={cancel} className="relative z-20">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-shade/30 transition duration-200 ease-out data-closed:opacity-0 motion-reduce:transition-none"
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className="w-full max-w-md rounded-xl border border-rule bg-paper p-6 shadow-lg shadow-shade/15 transition duration-200 ease-out data-closed:scale-95 data-closed:opacity-0 motion-reduce:transition-none"
        >
          {shownStep && <StepContent step={shownStep} />}
        </DialogPanel>
      </div>
    </Dialog>
  )
}
