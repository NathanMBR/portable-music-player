import { useCallback, useState } from 'react'

/**
 * Whether an element is on screen, and the ref that tells. It follows the element as it scrolls in
 * and out, and counts it off screen while a scrolling area around it hides it, like the song list.
 */
export const useIsOnScreen = () => {
  const [isOnScreen, setIsOnScreen] = useState(false)

  // React calls the function a ref returns once the element leaves the page.
  const observeOnScreen = useCallback((element: Element | null) => {
    if (!element) return

    const observer = new IntersectionObserver(entries => {
      const latest = entries[entries.length - 1]
      if (latest) setIsOnScreen(latest.isIntersecting)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [isOnScreen, observeOnScreen] as const
}
