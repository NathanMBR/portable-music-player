import type { CommandHandler } from './mockCommands'

// Wider than tall, like some scanned covers, so the square miniature has to crop it.
const COVER_WIDTH = 96
const COVER_HEIGHT = 64

/**
 * How long a story waits for a cover to show: its square has to stay on screen for a moment before
 * it's read, then the image is decoded. On a busy machine, like CI running every test at once,
 * that can take longer than `waitFor`'s default second.
 */
export const UNTIL_COVER_SHOWS = { timeout: 3000 }

/** `read_cover`'s answer for a song without a cover: no bytes at all. */
export const noCover: CommandHandler = () => new ArrayBuffer(0)

/**
 * The bytes of a small PNG drawn in the browser, as `read_cover` would send a song's embedded
 * cover. Stories have no songs to read covers from, so they draw one. It fades from pen to
 * correction, so it can't be mistaken for the placeholder.
 */
export const drawCover = async (): Promise<ArrayBuffer> => {
  const canvas = new OffscreenCanvas(COVER_WIDTH, COVER_HEIGHT)
  const context = canvas.getContext('2d')
  if (!context) throw new Error("This browser can't draw the stories' cover")

  const tokens = getComputedStyle(document.documentElement)
  const fade = context.createLinearGradient(0, 0, COVER_WIDTH, COVER_HEIGHT)
  fade.addColorStop(0, tokens.getPropertyValue('--color-pen'))
  fade.addColorStop(1, tokens.getPropertyValue('--color-correction'))
  context.fillStyle = fade
  context.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT)

  const png = await canvas.convertToBlob({ type: 'image/png' })
  return png.arrayBuffer()
}
