// Shown on two lines in the side menu, with "Portable" above "Music Player".
export const APP_TITLE_LINES = ['Portable', 'Music Player'] as const

// The window's title while no song is in the player, as in tauri.conf.json.
export const APP_NAME = APP_TITLE_LINES.join(' ')
