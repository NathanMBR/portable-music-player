/**
 * The step of a slider nearest `value`, where the browser stops its thumb. Drawing the track's fill
 * from it, rather than from `value`, keeps the fill's end under the thumb.
 */
export const snapToStep = (value: number, step: number) => Math.round(value / step) * step
