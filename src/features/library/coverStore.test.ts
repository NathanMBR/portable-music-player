import type { InvokeArgs } from '@tauri-apps/api/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { failingCommand, mockCommands } from '../../testing/mockCommands'
import { shownNotifications } from '../../testing/notifications'
import { MAX_CACHED_COVERS } from './constants'
import { useCoverStore } from './coverStore'

const pathOf = (title: string) => `Songs/${title}.mp3`

// Rust sends a cover's bytes as they are. The store only wraps them, so any bytes will do.
const bytesOf = (text: string) => new TextEncoder().encode(text).buffer

const requestedPath = (args?: InvokeArgs) => (args as { path: string }).path

// A read_cover that answers every song with a cover of its own.
const readEachCover = (args?: InvokeArgs) => bytesOf(`the front cover of ${requestedPath(args)}`)

const NO_COVER = new ArrayBuffer(0)

const COVER_FAILURE = "Couldn't load a cover"

// jsdom makes no object URLs, so the tests make their own, and keep the bytes of those not freed.
const heldBytes = new Map<string, Blob>()

beforeEach(() => {
  let urlCount = 0
  URL.createObjectURL = (bytes: Blob | MediaSource) => {
    if (!(bytes instanceof Blob)) throw new Error('Covers are made from blobs')
    urlCount += 1
    const url = `blob:cover-${urlCount}`
    heldBytes.set(url, bytes)
    return url
  }
  URL.revokeObjectURL = (url: string) => {
    heldBytes.delete(url)
  }
})

afterEach(() => heldBytes.clear())

const loadCover = (path: string) => useCoverStore.getState().loadCover(path)

const coverOf = (path: string) => useCoverStore.getState().covers.get(path)

/** The text of the bytes a song's cover shows, or `null` when it shows none. */
const shownText = async (path: string) => {
  const cover = coverOf(path)
  if (cover?.kind !== 'shown') return null
  return (await heldBytes.get(cover.url)?.text()) ?? null
}

/** A `read_cover` that answers only once `answer` is called, like Rust reading a slow drive. */
const slowReadCover = () => {
  let answer: (bytes: ArrayBuffer) => void = () => undefined
  const handler = () =>
    new Promise<ArrayBuffer>(resolve => {
      answer = resolve
    })
  return { handler, answer: (bytes: ArrayBuffer) => answer(bytes) }
}

describe('loadCover', () => {
  it('shows the cover Rust reads through an object URL of its bytes', async () => {
    const path = pathOf('The Temple of Hate')
    mockCommands({ read_cover: () => bytesOf('the front cover of The Temple of Hate') })

    await loadCover(path)

    expect(coverOf(path)).toEqual({ kind: 'shown', url: expect.any(String) })
    expect(await shownText(path)).toBe('the front cover of The Temple of Hate')
  })

  it('shows nothing while Rust reads the cover', async () => {
    const path = pathOf('Ancient Winds')
    const readCover = slowReadCover()
    mockCommands({ read_cover: readCover.handler })

    const loading = loadCover(path)

    expect(coverOf(path)).toEqual({ kind: 'reading' })
    readCover.answer(bytesOf('the front cover of Ancient Winds'))
    await loading
    expect(await shownText(path)).toBe('the front cover of Ancient Winds')
  })

  it('asks Rust for each cover only once', async () => {
    const path = pathOf('...And Justice for All')
    const readCover = vi.fn(() => bytesOf('the front cover of ...And Justice for All'))
    mockCommands({ read_cover: readCover })

    await Promise.all([loadCover(path), loadCover(path)])
    await loadCover(path)

    expect(readCover).toHaveBeenCalledOnce()
  })

  it('shows no cover for a song without one, holding no bytes', async () => {
    const path = pathOf('Gasoline')
    mockCommands({ read_cover: () => NO_COVER })

    await loadCover(path)

    expect(coverOf(path)).toEqual({ kind: 'missing' })
    expect(heldBytes.size).toBe(0)
  })

  it("shows no cover for a song whose cover can't be read, and notifies Rust's reason", async () => {
    const path = pathOf('Battery')
    const songMissing = `Couldn't find ${path}: it may have been moved, renamed or deleted`
    mockCommands({ read_cover: failingCommand(songMissing) })

    await loadCover(path)

    expect(coverOf(path)).toEqual({ kind: 'missing' })
    expect(shownNotifications()).toEqual([
      { type: 'error', title: COVER_FAILURE, description: songMissing }
    ])
  })

  it('keeps a single notification however many covers fail, with the latest reason', async () => {
    const failures: Record<string, string> = {
      [pathOf('Angels and Demons')]: `Couldn't read ${pathOf('Angels and Demons')}: I/O error`,
      [pathOf('Be Yourself')]: `Couldn't read ${pathOf('Be Yourself')}: I/O error`
    }
    mockCommands({ read_cover: args => Promise.reject(failures[requestedPath(args)]) })

    await loadCover(pathOf('Angels and Demons'))
    await loadCover(pathOf('Be Yourself'))

    expect(shownNotifications()).toEqual([
      { type: 'error', title: COVER_FAILURE, description: failures[pathOf('Be Yourself')] }
    ])
  })

  it('frees the covers asked for longest ago once more than the most it keeps are held', async () => {
    const trackNumbered = (number: number) =>
      pathOf(`${String(number).padStart(3, '0')} Master of Puppets`)
    const lastTrackNumber = MAX_CACHED_COVERS + 1
    mockCommands({ read_cover: readEachCover })

    for (let number = 1; number <= lastTrackNumber; number++) await loadCover(trackNumbered(number))

    expect(coverOf(trackNumbered(1))).toBeUndefined()
    expect(await shownText(trackNumbered(2))).toBe(`the front cover of ${trackNumbered(2)}`)
    expect(await shownText(trackNumbered(lastTrackNumber))).toBe(
      `the front cover of ${trackNumbered(lastTrackNumber)}`
    )
    expect(heldBytes.size).toBe(MAX_CACHED_COVERS)
  })
})

describe('dropUnreadableCover', () => {
  it("shows no cover in place of bytes the webview can't draw, and frees them", async () => {
    const path = pathOf("This Cocaine Makes Me Feel Like I'm on This Song")
    mockCommands({ read_cover: () => bytesOf('not an image') })
    await loadCover(path)

    useCoverStore.getState().dropUnreadableCover(path)

    expect(coverOf(path)).toEqual({ kind: 'missing' })
    expect(heldBytes.size).toBe(0)
  })
})

describe('forgetCovers', () => {
  it('forgets every cover and frees their bytes', async () => {
    mockCommands({ read_cover: readEachCover })
    await loadCover(pathOf('The Frayed Ends of Sanity'))
    await loadCover(pathOf('Reactor'))

    useCoverStore.getState().forgetCovers()

    expect(useCoverStore.getState().covers.size).toBe(0)
    expect(heldBytes.size).toBe(0)
  })

  it('drops a cover Rust was still reading when the covers were forgotten', async () => {
    const path = pathOf('Ritual')
    const readCover = slowReadCover()
    mockCommands({ read_cover: readCover.handler })
    const loading = loadCover(path)

    useCoverStore.getState().forgetCovers()
    readCover.answer(bytesOf('the front cover of Ritual'))
    await loading

    expect(coverOf(path)).toBeUndefined()
    expect(heldBytes.size).toBe(0)
  })
})
