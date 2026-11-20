import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import type { ReactNode } from 'react'

type ModalProps = {
  /** Shows the dialog, which fades in, and fades out when it turns false. */
  isOpen: boolean
  /** Runs on Escape or a click outside the panel, which should close the dialog. */
  onClose: () => void
  /** The panel's content, starting with a `ModalTitle`, and its buttons in `ModalButtons`. */
  children: ReactNode
  /** A wider panel, for content with lists, like the New playlist dialog's songs. */
  isWide?: boolean
}

/**
 * Modal dialog over a dimmed page: a panel in the middle of the window, which fades and grows in,
 * then back out. While it's open, the page behind it can't be reached, and Escape or a click
 * outside the panel call `onClose`. Its content starts with a `ModalTitle`, the dialog's name for
 * screen readers, and ends with its buttons in a `ModalButtons`. The panel is never taller than the
 * window: its content is a column, in which a list can scroll.
 *
 * @summary Modal dialog over a dimmed page
 */
export const Modal = ({ isOpen, onClose, children, isWide = false }: ModalProps) => (
  <Dialog open={isOpen} onClose={onClose} className="relative z-20">
    <DialogBackdrop
      transition
      className="fixed inset-0 bg-shade/30 transition duration-200 ease-out data-closed:opacity-0 motion-reduce:transition-none"
    />
    <div className="fixed inset-0 flex items-center justify-center p-4">
      <DialogPanel
        transition
        className={`flex max-h-full w-full flex-col rounded-xl border border-rule bg-paper p-6 shadow-lg shadow-shade/15 transition duration-200 ease-out data-closed:scale-95 data-closed:opacity-0 motion-reduce:transition-none ${isWide ? 'max-w-xl' : 'max-w-md'}`}
      >
        {children}
      </DialogPanel>
    </div>
  </Dialog>
)

/** The title at the top of a `Modal`'s panel, which names the dialog for screen readers. */
export const ModalTitle = ({ children }: { children: ReactNode }) => (
  <DialogTitle className="text-base font-semibold text-ink">{children}</DialogTitle>
)

/** The buttons at the bottom of a `Modal`'s panel, at its right end, the main one last. */
export const ModalButtons = ({ children }: { children: ReactNode }) => (
  <div className="mt-6 flex flex-wrap justify-end gap-2">{children}</div>
)
