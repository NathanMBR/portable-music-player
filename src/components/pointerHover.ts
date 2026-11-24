// Pointers that can rest over an element without pressing it. A finger can't.
const POINTERS_WITH_HOVER = new Set(['mouse', 'pen'])

/** Whether a pointer of this type hovers, as a tooltip needs, from a `PointerEvent`'s `pointerType`. */
export const canHover = (pointerType: string) => POINTERS_WITH_HOVER.has(pointerType)
