/**
 * The room to keep free below the notifications for everything at the bottom of the window, like
 * the audio player and a floating button above it: their CSS lengths added up.
 */
export const stackClearances = (lengths: string[]) => {
  if (lengths.length <= 1) {
    return lengths[0]
  }
  return `calc(${lengths.join(' + ')})`
}
