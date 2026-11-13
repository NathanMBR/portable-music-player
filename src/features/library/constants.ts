import { MusicalNoteIcon } from '@heroicons/react/20/solid'

// Must match SONGS_FOLDER_NAME in src-tauri/src/library.rs.
export const SONGS_FOLDER_NAME = 'Songs'

// Shared by the Songs header and the Songs entry in the side menu.
export const SONGS_ICON = MusicalNoteIcon

// How many covers stay in memory, the one asked for longest ago freed first. It's far more rows
// than fit on any screen, so a cover on screen is never the one freed, while scrolling through
// hundreds of songs doesn't keep every cover's bytes.
export const MAX_CACHED_COVERS = 100

// How long a song's row stays on screen before its cover is read, so the rows a fast scroll flies
// past don't each make Rust read the drive.
export const COVER_READ_DELAY_MS = 150
