import type { InvokeArgs } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { mockWindows } from '@tauri-apps/api/mocks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockCommands } from '../../testing/mockCommands'
import { connectSongDrop } from './songDropEvents'
import { useSongDropStore } from './songDropStore'

const DROPPED_PATHS = ['/home/user/Music/Extreme Dream.mp3', '/home/user/Music/Audioslave']
const POSITION = { x: 412, y: 236 }

const isDragging = () => useSongDropStore.getState().isDragging

// Listening goes through a few of Tauri's calls, each answered a moment later.
const untilListening = () => new Promise(resolve => setTimeout(resolve))

describe('connectSongDrop', () => {
  let disconnect = () => {}
  const checkDroppedSongs = vi.fn((_args?: InvokeArgs) => ({
    songCount: 0,
    conflicts: [],
    failures: []
  }))

  beforeEach(async () => {
    mockWindows('main')
    checkDroppedSongs.mockClear()
    mockCommands({ check_dropped_songs: checkDroppedSongs })
    disconnect = connectSongDrop()
    await untilListening()
  })

  afterEach(() => {
    disconnect()
  })

  it('shows where to drop while files are dragged over the window', async () => {
    await emit('tauri://drag-enter', { paths: DROPPED_PATHS, position: POSITION })
    expect(isDragging()).toBe(true)

    await emit('tauri://drag-over', { position: { x: 420, y: 240 } })
    expect(isDragging()).toBe(true)

    await emit('tauri://drag-leave')
    expect(isDragging()).toBe(false)
  })

  it('shows nothing for a drag without files, like a selected text', async () => {
    await emit('tauri://drag-enter', { paths: [], position: POSITION })

    expect(isDragging()).toBe(false)
  })

  it('adds the songs of what is dropped', async () => {
    await emit('tauri://drag-enter', { paths: DROPPED_PATHS, position: POSITION })

    await emit('tauri://drag-drop', { paths: DROPPED_PATHS, position: POSITION })

    expect(isDragging()).toBe(false)
    await vi.waitFor(() =>
      expect(checkDroppedSongs).toHaveBeenCalledExactlyOnceWith({ paths: DROPPED_PATHS })
    )
  })

  it('stops following drags once disconnected', async () => {
    disconnect()
    await untilListening()

    await emit('tauri://drag-enter', { paths: DROPPED_PATHS, position: POSITION })

    expect(isDragging()).toBe(false)
  })
})
