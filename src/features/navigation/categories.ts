import { SONGS_ICON } from '../library/constants'

export const CATEGORIES = [{ id: 'songs', label: 'Songs', icon: SONGS_ICON }] as const

export type CategoryId = (typeof CATEGORIES)[number]['id']

export const DEFAULT_CATEGORY: CategoryId = 'songs'
