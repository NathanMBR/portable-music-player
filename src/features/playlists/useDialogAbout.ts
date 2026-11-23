import { useState } from 'react'

/**
 * The open state of a dialog about one thing, like the playlist a Delete asks about. The thing
 * stays once the dialog closes, so the dialog still shows it while it fades out, after its row may
 * be gone.
 */
export const useDialogAbout = <Subject>() => {
  const [subject, setSubject] = useState<Subject | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  return {
    subject,
    isOpen,
    open: (chosen: Subject) => {
      setSubject(chosen)
      setIsOpen(true)
    },
    close: () => setIsOpen(false)
  }
}
