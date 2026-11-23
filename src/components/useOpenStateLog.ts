import { useEffect, useRef } from 'react'

/**
 * Calls `logChange` each time a popup, like a select's list or a menu, opens or closes, never on
 * the first render, so StrictMode's second run of the mount effect logs nothing either.
 */
export const useOpenStateLog = (isOpen: boolean, logChange: (isOpen: boolean) => void) => {
  const wasOpen = useRef(isOpen)

  useEffect(() => {
    if (isOpen === wasOpen.current) {
      return
    }
    wasOpen.current = isOpen
    logChange(isOpen)
  }, [isOpen, logChange])
}
