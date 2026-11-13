import { SONGS_ICON } from '../library/constants'
import { SETTINGS_ICON, SETTINGS_TITLE } from '../settings/constants'

export const CATEGORIES = [
  { id: 'songs', label: 'Songs', icon: SONGS_ICON },
  { id: 'settings', label: SETTINGS_TITLE, icon: SETTINGS_ICON }
] as const

export type CategoryId = (typeof CATEGORIES)[number]['id']

export const DEFAULT_CATEGORY: CategoryId = 'songs'

/** The name the menu shows for a category. */
export const categoryLabel = (id: CategoryId) =>
  CATEGORIES.find(category => category.id === id)?.label ?? id
