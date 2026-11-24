/**
 * Waits two frames, for the browser to hover whatever the story drew under its own pointer. In some
 * runs that pointer rests on the story's top-left corner, and the browser hovers what's there a
 * frame after the story renders, which would end a hover the story had started by then.
 */
export const untilBrowserPointerSettles = () =>
  new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
