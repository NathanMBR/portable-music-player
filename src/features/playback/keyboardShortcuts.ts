import { clamp } from '../../clamp'
import { logJump, logVolume } from './playbackLog'
import { audibleVolume, usePlaybackStore } from './playbackStore'

// How far a press of the left or right arrow jumps in the song, like the progress bar's own arrows.
const JUMP_SECONDS = 5

// How much a press of the up or down arrow turns the volume, in percent, like a turn of the wheel.
const VOLUME_STEP_PERCENT = 5

// The store keeps the volume from 0 to 1, while the keys turn it, and the log names it, in percent.
const FULL_VOLUME_PERCENT = 100

const SPACE = ' '

// Where every key belongs to the focus: a text field types and moves its caret with them, and a
// dialog or an open list is what the keys are for while it's there.
const KEEPS_EVERY_KEY =
  'input:not([type="range"]), textarea, [role="dialog"], [role="listbox"], [role="menu"]'

// The controls each key works on: Space clicks buttons, checkboxes and radios, and the arrows move
// sliders and radios, open a select's or a menu's list, and move a sortable row once it's picked up.
const SPACE_CONTROLS = 'button, [role="button"], [role="checkbox"], [role="radio"]'
const ARROW_CONTROLS =
  'input[type="range"], [aria-haspopup], [role="radio"], [aria-roledescription="sortable"]'

type Shortcut = {
  /** What the key does to the player. */
  act: () => void
  /** The controls the key works on, which keep it while they're reached from the keyboard. */
  controlsUsingIt: string
  /** Whether holding the key down acts again at each of its repeats. */
  repeatsWhileHeld: boolean
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

const arrowShortcut = (act: () => void): Shortcut => ({
  act,
  controlsUsingIt: ARROW_CONTROLS,
  repeatsWhileHeld: true
})

const SHORTCUTS: Partial<Record<string, Shortcut>> = {
  // Holding Space down would pause and resume the song over and over.
  [SPACE]: {
    act: () => playback().togglePlaying(),
    controlsUsingIt: SPACE_CONTROLS,
    repeatsWhileHeld: false
  },
  ArrowLeft: arrowShortcut(jumpBy(-JUMP_SECONDS)),
  ArrowRight: arrowShortcut(jumpBy(JUMP_SECONDS)),
  ArrowUp: arrowShortcut(turnVolumeBy(VOLUME_STEP_PERCENT)),
  ArrowDown: arrowShortcut(turnVolumeBy(-VOLUME_STEP_PERCENT))
}

// A key pressed with a modifier is another shortcut, like Shift and Space, which scrolls back up.
const hasModifier = (event: KeyboardEvent) =>
  event.altKey || event.ctrlKey || event.metaKey || event.shiftKey

/**
 * Has the keyboard control the song in the player, for as long as the app runs: Space pauses and
 * resumes it, the left and right arrows jump 5 seconds back and forward, and the up and down arrows
 * turn the volume up and down by 5%. Only while a song is in the player, and only the bare keys.
 * Returns a function that stops following them.
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

  const isLeftToTheFocus = (event: KeyboardEvent, shortcut: Shortcut) => {
    const focus = event.target
    return (
      focus instanceof Element &&
      (focus.closest(KEEPS_EVERY_KEY) !== null ||
        (isFocusFromKeyboard && focus.matches(shortcut.controlsUsingIt)))
    )
  }

  const shortcutFor = (event: KeyboardEvent) => {
    const shortcut = SHORTCUTS[event.key]
    const isForThePlayer =
      shortcut !== undefined &&
      playback().session !== null &&
      !hasModifier(event) &&
      !isLeftToTheFocus(event, shortcut)
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
      shortcut.act()
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
