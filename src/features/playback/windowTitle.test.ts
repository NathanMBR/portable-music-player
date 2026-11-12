import type { InvokeArgs } from '@tauri-apps/api/core'
import { mockWindows } from '@tauri-apps/api/mocks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { failingCommand, mockCommands } from '../../testing/mockCommands'
import { shownNotifications } from '../../testing/notifications'
import type { Track } from '../library/types'
import { usePlaybackStore } from './playbackStore'
import { connectWindowTitle } from './windowTitle'

const lastingChild: Track = {
  path: 'Songs/Lasting Child.mp3',
  title: 'Lasting Child',
  artist: 'Angra'
}
const makeBelieve: Track = {
  path: 'Songs/Make Believe.mp3',
  title: 'Make Believe',
  artist: 'Angra'
}

const playback = () => usePlaybackStore.getState()

/** Answers Tauri's own command for `setTitle`, and keeps every title the window was given. */
const mockWindowTitle = () => {
  const titles: string[] = []
  mockCommands({
    'plugin:window|set_title': (args?: InvokeArgs) => {
      titles.push((args as { value: string }).value)
    }
  })
  return titles
}

let disconnect = () => {}

const connect = () => {
  disconnect = connectWindowTitle()
}

// Lets the title's invoke() reach the mocked command.
const settle = () => new Promise(resolve => setTimeout(resolve))

describe('connectWindowTitle', () => {
  beforeEach(() => {
    mockWindows('main')
  })

  // Before the shared cleanup, whose store reset would otherwise retitle a window it already took away.
  afterEach(() => {
    disconnect()
  })

  it('names the window after the app while no song is in the player', async () => {
    const titles = mockWindowTitle()

    connect()
    await settle()

    expect(titles).toEqual(['Portable Music Player'])
  })

  it('names the window after the song in the player, and back after the app on Stop', async () => {
    const titles = mockWindowTitle()
    connect()

    playback().playTrack(lastingChild, [lastingChild, makeBelieve])
    playback().playNext()
    playback().stop()
    await settle()

    expect(titles).toEqual([
      'Portable Music Player',
      'Lasting Child — Portable Music Player',
      'Make Believe — Portable Music Player',
      'Portable Music Player'
    ])
  })

  it("names the window after the song's tag title alone, not its file name or artist", async () => {
    const bringEmBackAlive: Track = {
      path: "Songs/05 Bring 'Em Back Alive.mp3",
      title: "Bring 'Em Back Alive",
      artist: 'Audioslave'
    }
    const titles = mockWindowTitle()
    connect()

    playback().playTrack(bringEmBackAlive, [bringEmBackAlive])
    await settle()

    expect(titles).toEqual([
      'Portable Music Player',
      "Bring 'Em Back Alive — Portable Music Player"
    ])
  })

  it('keeps the title while the song plays on or pauses', async () => {
    const setTitle = vi.fn()
    mockCommands({ 'plugin:window|set_title': setTitle })
    connect()
    playback().playTrack(lastingChild, [lastingChild])

    playback().reportProgress(12)
    playback().togglePlaying()
    await settle()

    expect(setTitle).toHaveBeenCalledTimes(2)
  })

  it("says when the title can't change", async () => {
    mockCommands({ 'plugin:window|set_title': failingCommand('The window is gone') })

    connect()
    await settle()

    expect(shownNotifications()).toEqual([
      {
        type: 'error',
        title: "Couldn't change the window title",
        description: 'The window is gone'
      }
    ])
  })
})
