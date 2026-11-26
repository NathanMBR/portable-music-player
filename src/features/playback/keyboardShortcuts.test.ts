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

    it('pauses and resumes the song with Space', () => {
      press(' ')
      expect(session()?.isPlaying).toBe(false)

      press(' ')
      expect(session()?.isPlaying).toBe(true)
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

    it('pauses only once while Space is held down', () => {
      press(' ')
      const heldDown = press(' ', { repeat: true })

      expect(session()?.isPlaying).toBe(false)
      expect(heldDown.defaultPrevented).toBe(true)
    })

    it('leaves the keys pressed with a modifier to the page', () => {
      const keyDowns = [
        press(' ', { shiftKey: true }),
        press('ArrowRight', { ctrlKey: true }),
        press('ArrowLeft', { altKey: true }),
        press('ArrowUp', { metaKey: true })
      ]

      expect(keyDowns.some(keyDown => keyDown.defaultPrevented)).toBe(false)
      expect(session()?.isPlaying).toBe(true)
      expect(session()?.elapsedSeconds).toBe(60)
      expect(playback().volume).toBe(0.5)
    })

    it('leaves every key to a text field', () => {
      show('<input type="search" aria-label="Search songs" />')
      clickOn('input')

      const keyDowns = [press(' '), press('ArrowLeft'), press('ArrowUp')]

      expect(keyDowns.some(keyDown => keyDown.defaultPrevented)).toBe(false)
      expect(session()?.isPlaying).toBe(true)
      expect(session()?.elapsedSeconds).toBe(60)
      expect(playback().volume).toBe(0.5)
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

    it('leaves Space to a control reached with Tab, but still jumps with the arrows', () => {
      show('<button>Next song</button>')
      tabTo('button')

      const space = press(' ')
      press('ArrowRight')

      expect(space.defaultPrevented).toBe(false)
      expect(session()?.isPlaying).toBe(true)
      expect(session()?.elapsedSeconds).toBe(65)
    })

    it('leaves the arrows to a control reached with Tab that moves with them', () => {
      show(`
        <input type="range" aria-label="Volume" />
        <button aria-haspopup="listbox">Order</button>
        <div role="radio" tabindex="0">Before</div>
        <div role="button" tabindex="0" aria-roledescription="sortable">Move</div>
      `)

      const keyDowns = ['input', 'button', '[role="radio"]', '[role="button"]'].map(selector => {
        tabTo(selector)
        return press('ArrowUp')
      })

      expect(keyDowns.some(keyDown => keyDown.defaultPrevented)).toBe(false)
      expect(playback().volume).toBe(0.5)
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
    const keyDowns = [' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].map(key => press(key))

    expect(keyDowns.some(keyDown => keyDown.defaultPrevented)).toBe(false)
    expect(session()).toBeNull()
    expect(playback().volume).toBe(1)
  })
})
