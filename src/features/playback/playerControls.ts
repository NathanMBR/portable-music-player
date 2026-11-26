import type { RepeatMode } from './playOrder'

/** A key that controls the player, as `KeyboardEvent.key` names it, pressed alone or with Ctrl. */
export type KeyCombination = { key: string; withCtrl: boolean }

const bare = (key: string): KeyCombination => ({ key, withCtrl: false })
const withCtrl = (key: string): KeyCombination => ({ key, withCtrl: true })

/** The keys that control the song in the player (`keyboardShortcuts.ts`). */
export const PLAYER_KEYS = {
  playOrPause: bare(' '),
  jumpBack: bare('ArrowLeft'),
  jumpForward: bare('ArrowRight'),
  turnVolumeUp: bare('ArrowUp'),
  turnVolumeDown: bare('ArrowDown'),
  previousSong: withCtrl('ArrowLeft'),
  nextSong: withCtrl('ArrowRight'),
  stop: withCtrl('x'),
  shuffle: bare('s'),
  repeat: bare('r'),
  mute: bare('m')
}

// The keys a tooltip can't write as the character they type.
const KEY_NAMES: Partial<Record<string, string>> = {
  ' ': 'Space',
  ArrowLeft: '←',
  ArrowRight: '→'
}

/** How the buttons' tooltips and the log write a key combination, like `Ctrl+→`. */
export const keysText = ({ key, withCtrl }: KeyCombination) =>
  `${withCtrl ? 'Ctrl+' : ''}${KEY_NAMES[key] ?? key}`

// The names of the player's buttons, which label them and which the log writes, from a click on
// them or a press of their keys alike.
export const SHUFFLE_NAME = 'Shuffle'
export const PREVIOUS_SONG_NAME = 'Previous song'
export const NEXT_SONG_NAME = 'Next song'
export const STOP_NAME = 'Stop'

export const REPEAT_NAMES: Record<RepeatMode, string> = {
  off: 'Repeat off',
  all: 'Repeat all',
  one: 'Repeat one'
}

/** The main button pauses a song that plays, and plays one that doesn't. */
export const playButtonName = (isPlaying: boolean) => (isPlaying ? 'Pause' : 'Play')

/** The speaker mutes the volume, and unmutes it once muted. */
export const muteButtonName = (isMuted: boolean) => (isMuted ? 'Unmute' : 'Mute')
