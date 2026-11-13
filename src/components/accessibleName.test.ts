import { afterEach, describe, expect, it } from 'vitest'
import { accessibleNameOf, labelOf } from './accessibleName'

const firstButtonOf = (html: string) => {
  document.body.innerHTML = html
  return document.querySelector('button') as HTMLButtonElement
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('accessibleNameOf', () => {
  it('takes the label of an icon-only button', () => {
    const button = firstButtonOf('<button aria-label="Open folder"><svg></svg></button>')

    expect(accessibleNameOf(button)).toBe('Open folder')
  })

  it('joins the texts of the elements it is labelled by, itself included', () => {
    const button = firstButtonOf(
      '<label id="label">Sort songs by</label>' +
        '<button id="select" aria-labelledby="label select">Title (if existing)</button>'
    )

    expect(accessibleNameOf(button)).toBe('Sort songs by Title (if existing)')
  })

  it('takes its own text without a label, with its spaces collapsed', () => {
    const button = firstButtonOf(
      '<button>\n  <span class="sr-only">Elapsed time </span>\n  01:23\n</button>'
    )

    expect(accessibleNameOf(button)).toBe('Elapsed time 01:23')
  })

  it('falls back to its tooltip', () => {
    const button = firstButtonOf('<button title="Show remaining time"><svg></svg></button>')

    expect(accessibleNameOf(button)).toBe('Show remaining time')
  })
})

describe('labelOf', () => {
  it("leaves out what the control shows, like a select's chosen option", () => {
    const button = firstButtonOf(
      '<label id="label">Sort songs by</label>' +
        '<button id="select" aria-labelledby="label select">Title (if existing)</button>'
    )

    expect(labelOf(button)).toBe('Sort songs by')
  })

  it('takes the label of a control labelled by nothing else', () => {
    const button = firstButtonOf('<button aria-label="Volume">40%</button>')

    expect(labelOf(button)).toBe('Volume')
  })
})
