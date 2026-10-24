import { MusicalNoteIcon } from '@heroicons/react/20/solid'

export const CATEGORIES = [{ id: 'songs', label: 'Songs', icon: MusicalNoteIcon }] as const

export type CategoryId = (typeof CATEGORIES)[number]['id']

export const DEFAULT_CATEGORY: CategoryId = 'songs'
