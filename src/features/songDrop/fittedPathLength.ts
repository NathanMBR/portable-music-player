/**
 * The length to declare as a path's `pathLength` so its dash pattern repeats a whole number of
 * times along it: the browser then stretches the dashes a little to fit, and moving dashes don't
 * jump where the path ends and starts again.
 */
export const fittedPathLength = (actualLength: number, patternLength: number) =>
  Math.max(1, Math.round(actualLength / patternLength)) * patternLength
