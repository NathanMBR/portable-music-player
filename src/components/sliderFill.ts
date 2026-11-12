/** Where the pen part of a slider's track ends: a share of the track, plus some thumb widths. */
export type FillEnd = { trackPercent: number; thumbWidths: number }

const HALF_A_THUMB = 0.5

/**
 * The end of a slider's pen part for `value`, under the thumb's center. The browser keeps the thumb
 * inside the track, so its center runs from half a thumb after the track's start to half a thumb
 * before its end, rather than from one end of the track to the other.
 */
export const fillEnd = (value: number, max: number): FillEnd => {
  const share = max > 0 ? value / max : 0
  return { trackPercent: share * 100, thumbWidths: HALF_A_THUMB - share }
}
