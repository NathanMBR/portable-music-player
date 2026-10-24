import type { Track } from './types'

// A fixed locale keeps the order the same on every computer: with LANG=C, Linux webviews default
// to the POSIX collation, which puts every uppercase letter before any lowercase one.
const SORT_LOCALE = 'en'

// Ignores case and accents and compares numbers by value, so "Track 2" comes before "Track 10".
const titleCollator = new Intl.Collator(SORT_LOCALE, { numeric: true, sensitivity: 'base' })

export const sortTracksByTitle = (tracks: Track[]) =>
  [...tracks].sort((first, second) => titleCollator.compare(first.title, second.title))
