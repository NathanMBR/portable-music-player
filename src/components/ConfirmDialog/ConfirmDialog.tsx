import { Description } from '@headlessui/react'
import { Button } from '../Button/Button'
import { Modal, ModalButtons, ModalTitle } from '../Modal/Modal'

type ConfirmDialogProps = {
  /** Shows the dialog, which fades in, and fades out when it turns false. */
  isOpen: boolean
  /** What it asks, like `Delete "Road trip"?`: the dialog's title. */
  question: string
  /** What the answer means, like what stays where it is. */
  details: string
  /** The text of the button that does it, like "Delete". */
  confirmLabel: string
  /** Runs when the user confirms. */
  onConfirm: () => void
  /** Runs on Cancel, Escape, or a click outside the dialog. */
  onCancel: () => void
}

/**
 * Modal dialog asking before something is done, like deleting a playlist: the question, what it
 * means, then Cancel and the button that does it. Escape and a click outside the dialog cancel.
 *
 * @summary Dialog asking before an action
 */
export const ConfirmDialog = ({
  isOpen,
  question,
  details,
  confirmLabel,
  onConfirm,
  onCancel
}: ConfirmDialogProps) => (
  <Modal isOpen={isOpen} onClose={onCancel}>
    <ModalTitle>{question}</ModalTitle>
    <Description className="mt-2 text-sm text-ink-faded">{details}</Description>
    <ModalButtons>
      <Button variant="quiet" onClick={onCancel}>
        Cancel
      </Button>
      <Button onClick={onConfirm}>{confirmLabel}</Button>
    </ModalButtons>
  </Modal>
)
