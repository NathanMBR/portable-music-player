const collapseSpaces = (text: string) => text.replace(/\s+/g, ' ').trim()

const textOf = (element: Element) => collapseSpaces(element.textContent ?? '')

const labelsOf = (element: Element) =>
  (element.getAttribute('aria-labelledby') ?? '')
    .split(' ')
    .map(id => element.ownerDocument.getElementById(id))
    .filter(label => label !== null)

/**
 * What screen readers call a control, in their order of preference: the elements it's labelled by,
 * its `aria-label`, its text, then its tooltip. It covers what the app's controls use, not the
 * whole ARIA naming algorithm.
 */
export const accessibleNameOf = (element: Element) => {
  const labels = labelsOf(element)
  if (labels.length > 0) return collapseSpaces(labels.map(textOf).join(' '))

  return (
    collapseSpaces(element.getAttribute('aria-label') ?? '') ||
    textOf(element) ||
    collapseSpaces(element.getAttribute('title') ?? '')
  )
}

/**
 * What labels a control apart from what it shows, like a select's label without its chosen
 * option: the elements it's labelled by, itself left out, else its `aria-label`.
 */
export const labelOf = (element: Element) => {
  const labels = labelsOf(element).filter(label => label !== element)
  if (labels.length > 0) return collapseSpaces(labels.map(textOf).join(' '))

  return collapseSpaces(element.getAttribute('aria-label') ?? '')
}
