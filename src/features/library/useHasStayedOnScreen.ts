import { useEffect, useState } from 'react'
import { useIsOnScreen } from './useIsOnScreen'

/**
 * Whether an element has stayed on screen for `delayMs` since it last came on screen, and the ref
 * that tells. It turns false as soon as the element leaves the screen, so an element a fast scroll
 * only flies past never counts, while one that stays counts for as long as it stays.
 */
export const useHasStayedOnScreen = (delayMs: number) => {
  const [isOnScreen, observeOnScreen] = useIsOnScreen()
  const [hasStayed, setHasStayed] = useState(false)

  useEffect(() => {
    if (!isOnScreen) {
      return
    }

    const staying = setTimeout(() => setHasStayed(true), delayMs)
    return () => {
      clearTimeout(staying)
      setHasStayed(false)
    }
  }, [isOnScreen, delayMs])

  return [isOnScreen && hasStayed, observeOnScreen] as const
}
