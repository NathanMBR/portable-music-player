// The player's height, from the `player` spacing token in src/index.css, for offsets set in CSS.
export const PLAYER_HEIGHT = 'var(--spacing-player)'

// The song's position moves in tenths of a second, as often as Rust reports it (`PROGRESS_INTERVAL`
// in `playback/controller.rs`): often enough for the progress bar to fill smoothly, while the
// player redraws only ten times a second.
export const POSITION_STEP_SECONDS = 0.1

/** How long the player's state has to stay the same before it's saved: the mouse wheel saves once. */
export const PLAYBACK_SAVE_DELAY_MS = 1000
