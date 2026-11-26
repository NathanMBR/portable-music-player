import { clamp } from '../../clamp'
import { logJump, logShortcut, logVolume } from './playbackLog'
import { audibleVolume, usePlaybackStore } from './playbackStore'
import {
  type KeyCombination,
  keysText,
  muteButtonName,
  NEXT_SONG_NAME,
  PLAYER_KEYS,
  PREVIOUS_SONG_NAME,
  playButtonName,
  REPEAT_NAMES,
  SHUFFLE_NAME,
  STOP_NAME
} from './playerControls'

// How far a press of the left or right arrow jumps in the song, like the progress bar's own arrows.
const JUMP_SECONDS = 5

// How much a press of the up or down arrow turns the volume, in percent, like a turn of the wheel.
const VOLUME_STEP_PERCENT = 5

// The store keeps the volume from 0 to 1, while the keys turn it, and the log names it, in percent.
const FULL_VOLUME_PERCENT = 100

// Where every key belongs to the focus: a text field types and moves its caret with them, and a
// dialog or an open list is what the keys are for while it's there.
const KEEPS_EVERY_KEY =
  'input:not([type="range"]), textarea, [role="dialog"], [role="listbox"], [role="menu"]'

// The controls each key works on: Space clicks buttons, checkboxes and radios, and the arrows move
// sliders and radios, open a select's or a menu's list, and move a sortable row once it's picked up.
const SPACE_CONTROLS = 'button, [role="button"], [role="checkbox"], [role="radio"]'
const ARROW_CONTROLS =
  'input[type="range"], [aria-haspopup], [role="radio"], [aria-roledescription="sortable"]'

/** The player's button some keys stand for, whose press is logged like a click on it. */
type StoodForButton = {
  /** The button's name before the press, as a click would log it. */
  name: () => string
  /** The state the press leaves the button in, for a button that has one. */
  stateAfter?: () => string
}

type Shortcut = {
  keys: KeyCombination
  /** What the keys do to the player. */
  act: () => void
  /** The controls the keys work on, which keep them while they're reached from the keyboard. */
  controlsUsingThem: string | null
  /** Whether holding the keys down acts again at each of their repeats. */
  repeatsWhileHeld: boolean
  /** `undefined` for the bare arrows, which stand for the sliders: those log their own moves. */
  button?: StoodForButton
}

const playback = () => usePlaybackStore.getState()

// The store keeps a jump within the song, and makes none before the song's length is known.
const jumpBy = (seconds: number) => () => {
  const from = playback().session?.elapsedSeconds
  if (from === undefined) {
    return
  }

  playback().seek(from + seconds)
  const to = playback().session?.elapsedSeconds
  if (to !== undefined && to !== from) {
    logJump(to)
  }
}

// From the volume heard, as the slider's wheel turns it: while muted, up starts again from silent,
// and down to silent mutes, keeping the volume from before for unmuting.
const turnVolumeBy = (percents: number) => () => {
  const from = Math.round(audibleVolume(playback()) * FULL_VOLUME_PERCENT)
  const to = clamp(from + percents, 0, FULL_VOLUME_PERCENT)
  if (to !== from) {
    playback().setVolume(to / FULL_VOLUME_PERCENT)
    logVolume(to)
  }
}

// The bare arrows move the song or the volume like the sliders, on and on while held down.
const sliderShortcut = (keys: KeyCombination, act: () => void): Shortcut => ({
  keys,
  act,
  controlsUsingThem: ARROW_CONTROLS,
  repeatsWhileHeld: true
})

type ButtonShortcut = {
  keys: KeyCombination
  act: () => void
  button: StoodForButton
  /** Left out for keys no control works on, like the letters. */
  controlsUsingThem?: string
}

// Held down, a button's keys would skip songs or toggle over and over.
const buttonShortcut = ({ controlsUsingThem, ...shortcut }: ButtonShortcut): Shortcut => ({
  ...shortcut,
  controlsUsingThem: controlsUsingThem ?? null,
  repeatsWhileHeld: false
})

const SHORTCUTS: Shortcut[] = [
  buttonShortcut({
    keys: PLAYER_KEYS.playOrPause,
    act: () => playback().togglePlaying(),
    controlsUsingThem: SPACE_CONTROLS,
    button: { name: () => playButtonName(playback().session?.isPlaying ?? false) }
  }),
  sliderShortcut(PLAYER_KEYS.jumpBack, jumpBy(-JUMP_SECONDS)),
  sliderShortcut(PLAYER_KEYS.jumpForward, jumpBy(JUMP_SECONDS)),
  sliderShortcut(PLAYER_KEYS.turnVolumeUp, turnVolumeBy(VOLUME_STEP_PERCENT)),
  sliderShortcut(PLAYER_KEYS.turnVolumeDown, turnVolumeBy(-VOLUME_STEP_PERCENT)),
  buttonShortcut({
    keys: PLAYER_KEYS.previousSong,
    act: () => playback().playPrevious(),
    controlsUsingThem: ARROW_CONTROLS,
    button: { name: () => PREVIOUS_SONG_NAME }
  }),
  buttonShortcut({
    keys: PLAYER_KEYS.nextSong,
    act: () => playback().playNext(),
    controlsUsingThem: ARROW_CONTROLS,
    button: { name: () => NEXT_SONG_NAME }
  }),
  buttonShortcut({
    keys: PLAYER_KEYS.stop,
    act: () => playback().stop(),
    button: { name: () => STOP_NAME }
  }),
  buttonShortcut({
    keys: PLAYER_KEYS.shuffle,
    act: () => playback().toggleShuffle(),
    button: { name: () => SHUFFLE_NAME, stateAfter: () => (playback().isShuffled ? 'on' : 'off') }
  }),
  buttonShortcut({
    keys: PLAYER_KEYS.repeat,
    act: () => playback().cycleRepeatMode(),
    button: {
      name: () => REPEAT_NAMES[playback().repeatMode],
      stateAfter: () => playback().repeatMode
    }
  }),
  buttonShortcut({
    keys: PLAYER_KEYS.mute,
    act: () => playback().toggleMute(),
    button: { name: () => muteButtonName(playback().isMuted) }
  })
]

// Caps Lock types the letters in capitals.
const keyOf = (event: KeyboardEvent) =>
  event.key.length === 1 ? event.key.toLowerCase() : event.key

// Ctrl is the one modifier the shortcuts use: Shift, Alt and Meta make other shortcuts, like Shift
// and Space, which scrolls back up.
const shortcutPressedBy = (event: KeyboardEvent) => {
  if (event.altKey || event.metaKey || event.shiftKey) {
    return undefined
  }
  const key = keyOf(event)
  return SHORTCUTS.find(({ keys }) => keys.key === key && keys.withCtrl === event.ctrlKey)
}

// Like a click on the button: logged before what it does, or once done for a button whose state
// it changes, as buttonLog.ts logs toggles.
const pressButton = (keys: KeyCombination, button: StoodForButton, act: () => void) => {
  const shortcut = keysText(keys)
  const name = button.name()
  if (button.stateAfter) {
    act()
    logShortcut(shortcut, name, button.stateAfter())
  } else {
    logShortcut(shortcut, name)
    act()
  }
}

const run = ({ keys, act, button }: Shortcut) => {
  if (button) {
    pressButton(keys, button, act)
  } else {
    act()
  }
}

/**
 * Has the keyboard control the song in the player, for as long as the app runs: Space pauses and
 * resumes it, the left and right arrows jump 5 seconds back and forward, the up and down arrows
 * turn the volume up and down by 5%, Ctrl with the left and right arrows goes to the previous and
 * the next song, Ctrl and x stops the player, s toggles shuffle, r changes the repeat mode, and m
 * mutes and unmutes. Only while a song is in the player, and only with the modifiers they name.
 * They're the page's own key events, not the system's like the media keys, so they work only while
 * the app's window has the focus. Returns a function that stops following them.
 *
 * The keys stay with the focus where they work on it: in a text field, a dialog or an open list,
 * and on a control reached with Tab that uses them, as Space clicks a button. A control clicked
 * with the mouse leaves them to the player, so Space pauses instead of clicking it again. A key
 * the player takes is taken whole, its release included, before anything on the page sees it.
 */
export const connectKeyboardShortcuts = () => {
  // A click hands the keys back to the player; only Tab moves the focus from the keyboard.
  let isFocusFromKeyboard = false
  // Headless UI's switches and checkboxes toggle on Space's release, so a taken key's goes too.
  const takenKeys = new Set<string>()

  const isLeftToTheFocus = (event: KeyboardEvent, { controlsUsingThem }: Shortcut) => {
    const focus = event.target
    return (
      focus instanceof Element &&
      (focus.closest(KEEPS_EVERY_KEY) !== null ||
        (isFocusFromKeyboard && controlsUsingThem !== null && focus.matches(controlsUsingThem)))
    )
  }

  const shortcutFor = (event: KeyboardEvent) => {
    const shortcut = shortcutPressedBy(event)
    const isForThePlayer =
      shortcut !== undefined && playback().session !== null && !isLeftToTheFocus(event, shortcut)
    return isForThePlayer ? shortcut : null
  }

  const take = (event: KeyboardEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const followKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Tab') {
      isFocusFromKeyboard = true
      return
    }

    const shortcut = shortcutFor(event)
    if (!shortcut) {
      takenKeys.delete(event.key)
      return
    }

    take(event)
    takenKeys.add(event.key)
    if (!event.repeat || shortcut.repeatsWhileHeld) {
      run(shortcut)
    }
  }

  const followKeyUp = (event: KeyboardEvent) => {
    if (takenKeys.delete(event.key)) {
      take(event)
    }
  }

  const followPointer = () => {
    isFocusFromKeyboard = false
  }

  // On the window, in the capture phase, the player decides before anything on the page sees a key.
  window.addEventListener('keydown', followKeyDown, true)
  window.addEventListener('keyup', followKeyUp, true)
  window.addEventListener('pointerdown', followPointer, true)
  return () => {
    window.removeEventListener('keydown', followKeyDown, true)
    window.removeEventListener('keyup', followKeyUp, true)
    window.removeEventListener('pointerdown', followPointer, true)
  }
}
