import { Description } from '@headlessui/react'
import { ArrowPathIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import { Button } from '../../../components/Button/Button'
import { Modal, ModalButtons, ModalTitle } from '../../../components/Modal/Modal'
import { ScrollBox } from '../../../components/ScrollBox/ScrollBox'
import { formatSongCount } from '../../library/libraryStatus'
import { type SongDropStep, useSongDropStore } from '../songDropStore'
import { listTakenNames, summarizeTakenNames } from '../takenNames'
import type { DroppedSongs } from '../types'

type ShownStep = Exclude<SongDropStep, { kind: 'idle' }>

/** The step the dialog shows, which stays the last one while the dialog fades out after it. */
const useShownStep = (step: SongDropStep) => {
  const [lastShownStep, setLastShownStep] = useState<ShownStep | null>(null)
  if (step.kind !== 'idle' && step !== lastShownStep) {
    setLastShownStep(step)
  }
  return step.kind === 'idle' ? lastShownStep : step
}

const BusyStep = ({ message }: { message: string }) => (
  <>
    <ModalTitle>Adding songs</ModalTitle>
    <div className="mt-4 flex items-center gap-3">
      <ArrowPathIcon className="size-5 shrink-0 text-pen motion-safe:animate-spin" />
      <Description aria-live="polite" className="text-sm text-ink-faded">
        {message}
      </Description>
    </div>
  </>
)

const TakenNamesList = ({ conflicts }: { conflicts: string[] }) => (
  <ScrollBox as="ul" label="Songs with the same name">
    {listTakenNames(conflicts).map(name => (
      <li key={name} className="truncate py-0.5">
        {name}
      </li>
    ))}
  </ScrollBox>
)

const TakenNamesQuestion = ({ droppedSongs }: { droppedSongs: DroppedSongs }) => {
  const copyTakenNames = useSongDropStore(state => state.copyTakenNames)
  const cancel = useSongDropStore(state => state.cancel)

  return (
    <>
      <ModalTitle>Replace songs with the same name?</ModalTitle>
      <Description className="mt-2 text-sm text-ink-faded">
        {summarizeTakenNames(droppedSongs)}
      </Description>
      <TakenNamesList conflicts={droppedSongs.conflicts} />
      <ModalButtons>
        <Button variant="quiet" onClick={cancel}>
          Cancel
        </Button>
        <Button variant="outlined" onClick={() => void copyTakenNames('replace')}>
          Replace them
        </Button>
        <Button onClick={() => void copyTakenNames('skip')}>Skip them</Button>
      </ModalButtons>
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
 * the drop are taken, it first asks what to do with those songs, listing them all in a box that
 * scrolls when they're many: skip them, replace the songs already there, or cancel, which copies
 * nothing. Escape and a click outside cancel only that question: songs being copied can't be
 * stopped.
 *
 * @summary Dialog adding dropped songs, asking about taken file names
 */
export const SongDropDialog = () => {
  const step = useSongDropStore(state => state.step)
  const cancel = useSongDropStore(state => state.cancel)
  const shownStep = useShownStep(step)

  return (
    <Modal isOpen={step.kind !== 'idle'} onClose={cancel}>
      {shownStep && <StepContent step={shownStep} />}
    </Modal>
  )
}
