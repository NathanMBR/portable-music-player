import { QueueListIcon } from '@heroicons/react/20/solid'

// Shared by the Playlists header and the Playlists entry in the side menu.
export const PLAYLISTS_TITLE = 'Playlists'
export const PLAYLISTS_ICON = QueueListIcon

// The alert in a playlist's play button's place, on its row and in its page's header, while songs
// are missing.
export const MISSING_SONGS_LABEL = 'Some songs are missing'

// Long enough for any title, short enough that a playlist's file name stays far below the 255
// characters file systems allow.
export const MAX_TITLE_LENGTH = 100

// The room the New playlist button takes below the notifications: its height and the gap above
// it. Sonner adds its own edge gap, the button's gap from the window's bottom.
export const NEW_PLAYLIST_BUTTON_CLEARANCE = '3.5rem'
