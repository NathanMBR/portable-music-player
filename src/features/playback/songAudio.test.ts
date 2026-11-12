import type { InvokeArgs } from '@tauri-apps/api/core'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { type CommandHandler, failingCommand, mockCommands } from '../../testing/mockCommands'
import { shownNotifications } from '../../testing/notifications'
import type { SongSource, Track } from '../library/types'
import { usePlaybackStore } from './playbackStore'
import { connectSongAudio, type ObjectUrls, type SongAudio } from './songAudio'

const trackTitled = (title: string): Track => ({ path: `Songs/${title}.mp3`, title })

const firstTrack = trackTitled('Never Understand')
const secondTrack = trackTitled('No Pain for the Dead')
const thirdTrack = trackTitled('Cyclus Doloris')
const queue = [firstTrack, secondTrack, thirdTrack]

const MEDIA_ERR_DECODE = 3

/** Stands in for an `<audio>` element, since jsdom can't play media. Tests play it by hand. */
class FakeAudio extends EventTarget implements SongAudio {
  src = ''
  currentTime = 0
  duration = Number.NaN
  volume = 1
  paused = true
  error: MediaError | null = null

  // What WebKitGTK answers once GStreamer has every plugin it needs for MP3.
  canPlayType = (): CanPlayTypeResult => 'maybe'

  play = () => {
    this.paused = false
    return Promise.resolve()
  }

  pause() {
    if (this.paused) return
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  }

  load() {
    this.currentTime = 0
    this.duration = Number.NaN
    this.error = null
  }

  removeAttribute(name: string) {
    if (name === 'src') this.src = ''
  }

  /** Loads the song's length, like the element does once it has read the file's header. */
  loadLength(seconds: number) {
    this.duration = seconds
    this.dispatchEvent(new Event('durationchange'))
  }

  /** Plays on to `seconds` and says so, like the element does a few times a second. */
  playTo(seconds: number) {
    this.currentTime = seconds
    this.dispatchEvent(new Event('timeupdate'))
  }

  end() {
    this.paused = true
    this.dispatchEvent(new Event('ended'))
  }

  /** Runs out of data to play, like the element does while the file arrives too slowly. */
  runOutOfData() {
    this.dispatchEvent(new Event('waiting'))
  }

  failWith(code: number) {
    this.error = { code } as MediaError
    this.dispatchEvent(new Event('error'))
  }
}

/** Hands out object URLs like the browser does, which jsdom can't, and keeps what each one holds. */
class FakeObjectUrls implements ObjectUrls {
  readonly live = new Map<string, Blob>()
  private createdCount = 0

  createObjectURL = (blob: Blob | MediaSource) => {
    this.createdCount++
    const url = `blob:song-${this.createdCount}`
    this.live.set(url, blob as Blob)
    return url
  }

  revokeObjectURL = (url: string) => {
    this.live.delete(url)
  }
}

const requestedPath = (args?: InvokeArgs) => (args as { path: string }).path

const bytesOf = (track: Track) => `the bytes of ${track.path}`

// Rust answers with the file's raw bytes, which these tests make up from its path.
const readSong = (args?: InvokeArgs) =>
  new TextEncoder().encode(`the bytes of ${requestedPath(args)}`).buffer

/** A track's URL on the song server, which these tests make up from its path. */
const streamUrlOf = (path: string) => `http://127.0.0.1:41234/token/${encodeURIComponent(path)}`

const streamSource = (args?: InvokeArgs): SongSource => ({
  kind: 'stream',
  url: streamUrlOf(requestedPath(args))
})

const memorySource = (): SongSource => ({ kind: 'memory' })

/** Rust's answers where songs play from memory (Windows): their whole file, from `read_song`. */
const songsFromMemory: Record<string, CommandHandler> = {
  song_source: memorySource,
  read_song: readSong
}

/** Rust's answers where songs stream from the song server (Linux). */
const streamedSongs: Record<string, CommandHandler> = { song_source: streamSource }

const playback = () => usePlaybackStore.getState()
const session = () => usePlaybackStore.getState().session

type ConnectedAudio = { audio: FakeAudio; objectUrls: FakeObjectUrls }

const connectAudio = (audio = new FakeAudio()): ConnectedAudio => {
  const objectUrls = new FakeObjectUrls()
  onTestFinished(connectSongAudio(audio, objectUrls))
  return { audio, objectUrls }
}

/** The bytes the audio is playing, read back from its object URL. */
const playedBytes = ({ audio, objectUrls }: ConnectedAudio) =>
  objectUrls.live.get(audio.src)?.text()

/** Lets every pending promise settle, for checks that something did *not* happen. */
const settle = () => new Promise(resolve => setTimeout(resolve))

const waitUntilPlaying = (connected: ConnectedAudio, track: Track) =>
  vi.waitFor(async () => expect(await playedBytes(connected)).toBe(bytesOf(track)))

const waitUntilStreaming = ({ audio }: ConnectedAudio, track: Track) =>
  vi.waitFor(() => expect(audio.src).toBe(streamUrlOf(track.path)))

/** Starts `track` from the queue and waits for its audio to load. */
const startPlaying = async (connected: ConnectedAudio, track: Track) => {
  playback().playTrack(track, queue)
  await waitUntilPlaying(connected, track)
}

// How often the webview reports where the audio is while it plays.
const REPORT_INTERVAL_MS = 250

/**
 * Streams `track` on a fake clock, and has its audio report twice, a report apart, the second time
 * from `seconds`: its clock is seen moving.
 */
const streamWithClockMovingAt = async (track: Track, seconds: number) => {
  vi.useFakeTimers()
  onTestFinished(() => {
    vi.useRealTimers()
  })
  mockCommands(streamedSongs)
  const connected = connectAudio()
  playback().playTrack(track, [track])
  await waitUntilStreaming(connected, track)
  const { audio } = connected
  audio.loadLength(270)
  audio.playTo(seconds - REPORT_INTERVAL_MS / 1000)
  vi.advanceTimersByTime(REPORT_INTERVAL_MS)
  audio.playTo(seconds)
  return audio
}

describe('connectSongAudio', () => {
  it('streams a song from the address Rust serves it at', async () => {
    const readSongFromRust = vi.fn(readSong)
    mockCommands({ ...streamedSongs, read_song: readSongFromRust })
    const connected = connectAudio()

    playback().playTrack(firstTrack, queue)

    await waitUntilStreaming(connected, firstTrack)
    expect(connected.audio.paused).toBe(false)
    expect(readSongFromRust).not.toHaveBeenCalled()
    expect(connected.objectUrls.live.size).toBe(0)
  })

  it('streams only the newest song when songs start faster than Rust answers', async () => {
    const answers = new Map<string, () => void>()
    mockCommands({
      song_source: args =>
        new Promise(resolve => {
          answers.set(requestedPath(args), () => resolve(streamSource(args)))
        })
    })
    const connected = connectAudio()
    playback().playTrack(firstTrack, queue)
    playback().playTrack(secondTrack, queue)
    await vi.waitFor(() => expect(answers.size).toBe(2))

    answers.get(secondTrack.path)?.()
    await waitUntilStreaming(connected, secondTrack)
    answers.get(firstTrack.path)?.()
    await settle()

    expect(connected.audio.src).toBe(streamUrlOf(secondTrack.path))
  })

  it('plays a song that starts from the bytes Rust reads from its file', async () => {
    mockCommands(songsFromMemory)
    const connected = connectAudio()

    await startPlaying(connected, secondTrack)

    expect(connected.objectUrls.live.get(connected.audio.src)?.type).toBe('audio/mpeg')
    expect(connected.audio.paused).toBe(false)
  })

  it("lets go of a song's bytes when another one starts, and of the last one on Stop", async () => {
    mockCommands(songsFromMemory)
    const connected = connectAudio()
    await startPlaying(connected, firstTrack)

    await startPlaying(connected, secondTrack)
    expect(connected.objectUrls.live.size).toBe(1)

    playback().stop()
    expect(connected.objectUrls.live.size).toBe(0)
  })

  it('pauses and resumes with the player', async () => {
    mockCommands(songsFromMemory)
    const connected = connectAudio()
    const { audio } = connected
    await startPlaying(connected, firstTrack)

    playback().togglePlaying()
    expect(audio.paused).toBe(true)

    playback().togglePlaying()
    expect(audio.paused).toBe(false)
  })

  it('plays at the volume of the player', () => {
    const connected = connectAudio()
    const { audio } = connected

    playback().setVolume(0.4)

    expect(audio.volume).toBe(0.4)
  })

  it('reports the length of the song and how far it has played', async () => {
    mockCommands(songsFromMemory)
    const connected = connectAudio()
    const { audio } = connected
    await startPlaying(connected, firstTrack)

    audio.loadLength(270)
    audio.playTo(12.5)

    expect(session()).toMatchObject({ durationSeconds: 270, elapsedSeconds: 12.5 })
  })

  it('jumps to the position chosen in the player', async () => {
    mockCommands(songsFromMemory)
    const connected = connectAudio()
    const { audio } = connected
    await startPlaying(connected, firstTrack)
    audio.loadLength(270)
    audio.playTo(80)

    playback().seek(200)

    expect(audio.currentTime).toBe(200)
  })

  it("doesn't pull the audio back to the time it last reported", async () => {
    mockCommands(songsFromMemory)
    const connected = connectAudio()
    const { audio } = connected
    await startPlaying(connected, firstTrack)
    audio.playTo(80)
    // Between two reports the audio plays on without saying so.
    audio.currentTime = 80.2

    playback().setVolume(0.5)

    expect(audio.currentTime).toBe(80.2)
  })

  it('goes on to the next song when one ends', async () => {
    mockCommands(songsFromMemory)
    const connected = connectAudio()
    const { audio } = connected
    await startPlaying(connected, firstTrack)

    audio.end()

    await waitUntilPlaying(connected, secondTrack)
    expect(audio.paused).toBe(false)
  })

  it('starts the song over when it ends with repeat one', async () => {
    mockCommands(songsFromMemory)
    const connected = connectAudio()
    const { audio } = connected
    usePlaybackStore.setState({ repeatMode: 'one' })
    await startPlaying(connected, firstTrack)
    audio.loadLength(270)
    audio.playTo(270)

    audio.end()

    expect(audio).toMatchObject({ currentTime: 0, paused: false })
    expect(await playedBytes(connected)).toBe(bytesOf(firstTrack))
  })

  it('stops the audio when the player is stopped', async () => {
    mockCommands(songsFromMemory)
    const connected = connectAudio()
    const { audio } = connected
    await startPlaying(connected, firstTrack)

    playback().stop()

    expect(audio).toMatchObject({ src: '', paused: true })
  })

  it('plays only the newest song when songs start faster than Rust reads them', async () => {
    const answers = new Map<string, () => void>()
    mockCommands({
      song_source: memorySource,
      read_song: args =>
        new Promise(resolve => {
          answers.set(requestedPath(args), () => resolve(readSong(args)))
        })
    })
    const connected = connectAudio()
    playback().playTrack(firstTrack, queue)
    playback().playTrack(secondTrack, queue)
    await vi.waitFor(() => expect(answers.size).toBe(2))

    answers.get(secondTrack.path)?.()
    await waitUntilPlaying(connected, secondTrack)
    answers.get(firstTrack.path)?.()
    await settle()

    expect(await playedBytes(connected)).toBe(bytesOf(secondTrack))
    expect(connected.objectUrls.live.size).toBe(1)
  })

  it("notifies and pauses when Rust can't find the song, and tries again on Play", async () => {
    const reason = `Couldn't find ${thirdTrack.path}: it may have been moved, renamed or deleted`
    mockCommands({ song_source: failingCommand(reason) })
    const connected = connectAudio()

    playback().playTrack(thirdTrack, queue)

    await vi.waitFor(() =>
      expect(shownNotifications()).toEqual([
        { type: 'error', title: `Couldn't play ${thirdTrack.title}`, description: reason }
      ])
    )
    expect(session()?.isPlaying).toBe(false)

    mockCommands(songsFromMemory)
    playback().togglePlaying()

    await waitUntilPlaying(connected, thirdTrack)
    expect(connected.audio.paused).toBe(false)
  })

  it("notifies and pauses when the audio can't play the file", async () => {
    mockCommands(songsFromMemory)
    const connected = connectAudio()
    const { audio } = connected
    await startPlaying(connected, secondTrack)

    audio.failWith(MEDIA_ERR_DECODE)

    expect(shownNotifications()).toEqual([
      {
        type: 'error',
        title: `Couldn't play ${secondTrack.title}`,
        description: 'The file is damaged.'
      }
    ])
    expect(session()?.isPlaying).toBe(false)
  })

  it("refuses to play when this computer can't play MP3 files, and says what to install", async () => {
    const track = trackTitled('Rebirth')
    const songSourceFromRust = vi.fn(memorySource)
    const readSongFromRust = vi.fn(readSong)
    mockCommands({ song_source: songSourceFromRust, read_song: readSongFromRust })
    const audio = new FakeAudio()
    audio.canPlayType = () => ''
    connectAudio(audio)

    playback().playTrack(track, [track])
    await settle()

    expect(shownNotifications()).toEqual([
      {
        type: 'error',
        title: `Couldn't play ${track.title}`,
        description:
          "This computer can't play MP3 files. On Linux, install GStreamer's good plugins (gst-plugins-good)."
      }
    ])
    expect(session()?.isPlaying).toBe(false)
    expect(songSourceFromRust).not.toHaveBeenCalled()
    expect(readSongFromRust).not.toHaveBeenCalled()
    expect(audio.src).toBe('')
  })

  it('notifies and pauses when the webview refuses to play', async () => {
    mockCommands(songsFromMemory)
    const audio = new FakeAudio()
    audio.play = () => Promise.reject(new DOMException('Autoplay is blocked', 'NotAllowedError'))
    connectAudio(audio)

    playback().playTrack(firstTrack, queue)

    await vi.waitFor(() =>
      expect(shownNotifications()).toMatchObject([
        { type: 'error', title: `Couldn't play ${firstTrack.title}` }
      ])
    )
    expect(session()?.isPlaying).toBe(false)
  })

  it('ignores a play request that a newer song or a pause cut short', async () => {
    mockCommands(songsFromMemory)
    const audio = new FakeAudio()
    audio.play = () => Promise.reject(new DOMException('Interrupted by a new load', 'AbortError'))
    const connected = connectAudio(audio)

    await startPlaying(connected, firstTrack)
    await settle()

    expect(shownNotifications()).toEqual([])
    expect(session()?.isPlaying).toBe(true)
  })
})

describe("the progress between the audio's reports", () => {
  it("runs on with the clock while the audio's clock holds still", async () => {
    const audio = await streamWithClockMovingAt(trackTitled('Angels and Demons'), 10)

    vi.advanceTimersByTime(3000)

    expect(session()?.elapsedSeconds).toBeCloseTo(13)
    expect(audio.currentTime).toBe(10)
  })

  it('moves on every tenth of a second, so the bar fills smoothly', async () => {
    await streamWithClockMovingAt(trackTitled('Paradise'), 10)

    vi.advanceTimersByTime(100)

    expect(session()?.elapsedSeconds).toBeCloseTo(10.1)
  })

  it("waits for the audio's clock to move again after a jump", async () => {
    const audio = await streamWithClockMovingAt(trackTitled('Streets of Tomorrow'), 10)
    playback().seek(100)
    // The webview reports the new position before it plays from there.
    audio.playTo(100)

    vi.advanceTimersByTime(2000)

    expect(session()?.elapsedSeconds).toBe(100)
  })

  it('stops running on when the audio pauses', async () => {
    await streamWithClockMovingAt(trackTitled('Here In The Now'), 10)
    playback().togglePlaying()

    vi.advanceTimersByTime(2000)

    expect(session()?.elapsedSeconds).toBe(10)
  })

  it('stops running on while the audio waits for data', async () => {
    const audio = await streamWithClockMovingAt(trackTitled('Make Believe'), 10)
    audio.runOutOfData()

    vi.advanceTimersByTime(2000)

    expect(session()?.elapsedSeconds).toBe(10)
  })

  it('leaves no clock running once the player stops', async () => {
    await streamWithClockMovingAt(trackTitled('Millennium Sun'), 10)

    playback().stop()

    expect(vi.getTimerCount()).toBe(0)
  })
})
