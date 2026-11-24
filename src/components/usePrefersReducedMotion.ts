import { useSyncExternalStore } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const reducedMotionQuery = () => window.matchMedia(REDUCED_MOTION_QUERY)

const followReducedMotion = (onChange: () => void) => {
  const query = reducedMotionQuery()
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/**
 * Whether the system asks for reduced motion, kept up to date, for motion run from script, which
 * `motion-reduce:` can't stop.
 */
export const usePrefersReducedMotion = () =>
  useSyncExternalStore(followReducedMotion, () => reducedMotionQuery().matches)
