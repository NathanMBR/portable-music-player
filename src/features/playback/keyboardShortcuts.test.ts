import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loggedMessages } from '../../testing/logs'
import type { Track } from '../library/types'
import { connectKeyboardShortcuts } from './keyboardShortcuts'
import { SONGS_SOURCE } from './playbackSource'
import { usePlaybackStore } from './playbackStore'

const overYourHead: Track = {
  path: 'Songs/Over Your Head.mp3',
  title: 'Over Your Head',
  artist: 'Shaman'
}
const runBoyRun: Track = { path: 'Songs/Run Boy Run.mp3', title: 'Run Boy Run', artist: 'Woodkid' }
const oneAndTheSame: Track = {
  path: 'Songs/One and the Same.mp3',
  title: 'One and the Same',
  artist: 'Audioslave'
}

const SONG_LENGTH_SECONDS = 240

const playback = () => usePlaybackStore.getState()
const session = () => usePlaybackStore.getState().session

const show = (html: string) => {
  document.body.innerHTML = html
}

const elementOf = (selector: string) => {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) {
    throw new Error(`Nothing matches ${selector}`)
  }
  return element
}

// The key goes where the browser sends it: to the element with the focus, else the page's body.
const press = (key: string, options: KeyboardEventInit = {}) => {
  const target = document.activeElement ?? document.body
  const keyDown = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
  target.dispatchEvent(keyDown)
  target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }))
  return keyDown
}

// jsdom moves no focus on its own, so each helper sends what the browser would, then focuses.
const tabTo = (selector: string) => {
  press('Tab')
  elementOf(selector).focus()
}

const clickOn = (selector: string) => {
  const element = elementOf(selector)
  element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  element.focus()
  element.click()
}

describe('connectKeyboardShortcuts', () => {
  let disconnect = () => {}

  beforeEach(() => {
    disconnect = connectKeyboardShortcuts()
  })

  afterEach(() => {
    disconnect()
    document.body.replaceChildren()
  })

  describe('with a song in the player', () => {
    beforeEach(() => {
      playback().playTrack(overYourHead, [overYourHead], SONGS_SOURCE)
      playback().reportDuration(SONG_LENGTH_SECONDS)
      playback().reportProgress(60)
      playback().setVolume(0.5)
    })

    it('pauses and resumes the song with Space, logged like a click on its button', () => {
      press(' ')
      expect(session()?.isPlaying).toBe(false)

      press(' ')
      expect(session()?.isPlaying).toBe(true)
      expect(loggedMessages().slice(-4)).toEqual([
        'Pressed shortcut "Space" for "Pause"',
        'Paused playing song "Over Your Head"',
        'Pressed shortcut "Space" for "Play"',
        'Resumed playing song "Over Your Head"'
      ])
    })

    it('jumps 5 seconds back and forward with the left and right arrows', () => {
      press('ArrowRight')
      expect(session()?.elapsedSeconds).toBe(65)

      press('ArrowLeft')
      press('ArrowLeft')
      expect(session()?.elapsedSeconds).toBe(55)
      expect(loggedMessages().slice(-3)).toEqual([
        'Jumping song to 01:05.000',
        'Jumping song to 01:00.000',
        'Jumping song to 00:55.000'
      ])
    })

    it('stops a jump at the start or the end of the song, logging none past it', () => {
      playback().reportProgress(3)
      press('ArrowLeft')
      press('ArrowLeft')
      expect(session()?.elapsedSeconds).toBe(0)

      playback().reportProgress(238)
      press('ArrowRight')
      expect(session()?.elapsedSeconds).toBe(SONG_LENGTH_SECONDS)
      expect(loggedMessages().slice(-2)).toEqual([
        'Jumping song to 00:00.000',
        'Jumping song to 04:00.000'
      ])
    })

    it('turns the volume up and down by 5% with the up and down arrows', () => {
      press('ArrowUp')
      expect(playback().volume).toBe(0.55)

      press('ArrowDown')
      press('ArrowDown')
      expect(playback().volume).toBe(0.45)
      expect(loggedMessages().slice(-3)).toEqual([
        'Set volume to 55%',
        'Set volume to 50%',
        'Set volume to 45%'
      ])
    })

    it('mutes once the down arrow reaches silent, keeping the volume to unmute to', () => {
      playback().setVolume(0.05)

      press('ArrowDown')

      expect(playback().isMuted).toBe(true)
      expect(playback().volume).toBe(0.05)
      expect(loggedMessages().slice(-1)).toEqual(['Set volume to 0%'])
    })

    it('goes to the next and the previous song with Ctrl and the right and left arrows', () => {
      playback().playTrack(runBoyRun, [overYourHead, runBoyRun, oneAndTheSame], SONGS_SOURCE)

      press('ArrowRight', { ctrlKey: true })
      expect(session()?.track).toEqual(oneAndTheSame)

      press('ArrowLeft', { ctrlKey: true })
      expect(session()?.track).toEqual(runBoyRun)
      expect(loggedMessages().slice(-4)).toEqual([
        'Pressed shortcut "Ctrl+→" for "Next song"',
        'Started playing song "One and the Same"',
        'Pressed shortcut "Ctrl+←" for "Previous song"',
        'Started playing song "Run Boy Run"'
      ])
    })

    it('stops the player with Ctrl and x', () => {
      press('x', { ctrlKey: true })

      expect(session()).toBeNull()
      expect(loggedMessages().slice(-2)).toEqual([
        'Pressed shortcut "Ctrl+x" for "Stop"',
        'Stopped playing song "Over Your Head"'
      ])
    })

    it('toggles shuffle with s, logging the state it leaves', () => {
      press('s')
      expect(playback().isShuffled).toBe(true)

      press('s')
      expect(playback().isShuffled).toBe(false)
      expect(loggedMessages().slice(-2)).toEqual([
        'Pressed shortcut "s" for "Shuffle" State: "on"',
        'Pressed shortcut "s" for "Shuffle" State: "off"'
      ])
    })

    it('changes the repeat mode with r, logging the state it leaves', () => {
      const modes = ['r', 'r', 'r'].map(key => {
        press(key)
        return playback().repeatMode
      })

      expect(modes).toEqual(['all', 'one', 'off'])
      expect(loggedMessages().slice(-3)).toEqual([
        'Pressed shortcut "r" for "Repeat off" State: "all"',
        'Pressed shortcut "r" for "Repeat all" State: "one"',
        'Pressed shortcut "r" for "Repeat one" State: "off"'
      ])
    })

    it('mutes and unmutes with m', () => {
      press('m')
      expect(playback().isMuted).toBe(true)

      press('m')
      expect(playback().isMuted).toBe(false)
      expect(playback().volume).toBe(0.5)
      expect(loggedMessages().slice(-2)).toEqual([
        'Pressed shortcut "m" for "Mute"',
        'Pressed shortcut "m" for "Unmute"'
      ])
    })

    it('takes the letters typed in capitals by Caps Lock', () => {
      press('S')
      press('X', { ctrlKey: true })

      expect(playback().isShuffled).toBe(true)
      expect(session()).toBeNull()
    })

    it('keeps the keys it takes, their release included, from the rest of the page', () => {
      const pageListener = vi.fn()
      document.addEventListener('keydown', pageListener)
      document.addEventListener('keyup', pageListener)

      const keyDowns = [' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].map(key =>
        press(key)
      )

      expect(keyDowns.map(keyDown => keyDown.defaultPrevented)).toEqual([
        true,
        true,
        true,
        true,
        true
      ])
      expect(pageListener).not.toHaveBeenCalled()
      document.removeEventListener('keydown', pageListener)
      document.removeEventListener('keyup', pageListener)
    })

    it('acts only once while a key other than a bare arrow is held down', () => {
      playback().playTrack(overYourHead, [overYourHead, runBoyRun, oneAndTheSame], SONGS_SOURCE)
      const heldDowns = ['m', 'ArrowRight', ' '].map(key => {
        const ctrlKey = key === 'ArrowRight'
        press(key, { ctrlKey })
        return press(key, { ctrlKey, repeat: true })
      })

      expect(session()?.isPlaying).toBe(false)
      expect(session()?.track).toEqual(runBoyRun)
      expect(playback().isMuted).toBe(true)
      expect(heldDowns.every(heldDown => heldDown.defaultPrevented)).toBe(true)
    })

    it('leaves the keys pressed with a modifier no shortcut takes to the page', () => {
      const keyDowns = [
        press(' ', { shiftKey: true }),
        press(' ', { ctrlKey: true }),
        press('ArrowUp', { ctrlKey: true }),
        press('ArrowRight', { ctrlKey: true, shiftKey: true }),
        press('ArrowLeft', { altKey: true }),
        press('ArrowUp', { metaKey: true }),
        press('S', { shiftKey: true }),
        press('m', { ctrlKey: true }),
        press('x')
      ]

      expect(keyDowns.some(keyDown => keyDown.defaultPrevented)).toBe(false)
      expect(session()?.isPlaying).toBe(true)
      expect(session()?.elapsedSeconds).toBe(60)
      expect(playback().volume).toBe(0.5)
      expect(playback().isMuted).toBe(false)
      expect(playback().isShuffled).toBe(false)
    })

    it('leaves every key to a text field or a text area', () => {
      show(`
        <input type="search" aria-label="Search songs" />
        <textarea aria-label="Description"></textarea>
      `)

      const keyDowns = ['input', 'textarea'].flatMap(selector => {
        clickOn(selector)
        return [
          press(' '),
          press('ArrowLeft'),
          press('ArrowUp'),
          press('ArrowRight', { ctrlKey: true }),
          press('x', { ctrlKey: true }),
          press('s'),
          press('r'),
          press('m')
        ]
      })

      expect(keyDowns.some(keyDown => keyDown.defaultPrevented)).toBe(false)
      expect(session()?.isPlaying).toBe(true)
      expect(session()?.elapsedSeconds).toBe(60)
      expect(playback().volume).toBe(0.5)
      expect(playback().isMuted).toBe(false)
      expect(playback().isShuffled).toBe(false)
      expect(playback().repeatMode).toBe('off')
    })

    it('leaves every key to a dialog or an open list', () => {
      show(`
        <div role="dialog"><button>Delete</button></div>
        <div role="listbox" tabindex="0"><div role="option">By title</div></div>
      `)

      clickOn('[role="dialog"] button')
      const inDialog = press(' ')
      clickOn('[role="listbox"]')
      const inList = press('ArrowDown')

      expect(inDialog.defaultPrevented).toBe(false)
      expect(inList.defaultPrevented).toBe(false)
      expect(session()?.isPlaying).toBe(true)
      expect(playback().volume).toBe(0.5)
    })

    it('leaves Space to a control reached with Tab, but still takes the arrows and letters', () => {
      show('<button>Next song</button>')
      tabTo('button')

      const space = press(' ')
      press('ArrowRight')
      press('m')

      expect(space.defaultPrevented).toBe(false)
      expect(session()?.isPlaying).toBe(true)
      expect(session()?.elapsedSeconds).toBe(65)
      expect(playback().isMuted).toBe(true)
    })

    it('leaves the arrows, with Ctrl or not, to a control reached with Tab that moves with them', () => {
      show(`
        <input type="range" aria-label="Volume" />
        <button aria-haspopup="listbox">Order</button>
        <div role="radio" tabindex="0">Before</div>
        <div role="button" tabindex="0" aria-roledescription="sortable">Move</div>
      `)

      const keyDowns = ['input', 'button', '[role="radio"]', '[role="button"]'].flatMap(
        selector => {
          tabTo(selector)
          return [press('ArrowUp'), press('ArrowLeft', { ctrlKey: true })]
        }
      )

      expect(keyDowns.some(keyDown => keyDown.defaultPrevented)).toBe(false)
      expect(playback().volume).toBe(0.5)
      expect(session()?.elapsedSeconds).toBe(60)
    })

    it('takes the keys from a control clicked with the mouse, even after a Tab', () => {
      show('<button>Next song</button><input type="range" aria-label="Song progress" />')
      tabTo('button')

      clickOn('button')
      press(' ')
      clickOn('input')
      press('ArrowUp')

      expect(session()?.isPlaying).toBe(false)
      expect(playback().volume).toBe(0.55)
    })
  })

  it('leaves the keys to the page while no song is in the player', () => {
    const keyDowns = [
      ...[' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 's', 'r', 'm'].map(key =>
        press(key)
      ),
      press('ArrowLeft', { ctrlKey: true }),
      press('ArrowRight', { ctrlKey: true }),
      press('x', { ctrlKey: true })
    ]

    expect(keyDowns.some(keyDown => keyDown.defaultPrevented)).toBe(false)
    expect(session()).toBeNull()
    expect(playback().volume).toBe(1)
    expect(playback().isMuted).toBe(false)
    expect(playback().isShuffled).toBe(false)
    expect(playback().repeatMode).toBe('off')
  })
})
