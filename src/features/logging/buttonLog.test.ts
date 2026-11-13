import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loggedMessages } from '../../testing/logs'
import { connectButtonLog } from './buttonLog'

let disconnectButtonLog: () => void

const show = (html: string) => {
  document.body.innerHTML = html
}

const click = (selector: string) =>
  document.querySelector(selector)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

beforeEach(() => {
  disconnectButtonLog = connectButtonLog()
})

afterEach(() => {
  disconnectButtonLog()
  document.body.replaceChildren()
})

describe('connectButtonLog', () => {
  it('logs the name of the clicked button', () => {
    show('<button aria-label="Scan again"></button>')

    click('button')

    expect(loggedMessages()).toEqual(['Clicked at button "Scan again"'])
  })

  it('logs the button when the click lands on its icon', () => {
    show('<button aria-label="Next song"><svg><path d="M0 0" /></svg></button>')

    click('path')

    expect(loggedMessages()).toEqual(['Clicked at button "Next song"'])
  })

  it('leaves switches to log their new state themselves', () => {
    show('<button role="switch" aria-checked="false" aria-label="Dark theme"></button>')

    click('button')

    expect(loggedMessages()).toEqual([])
  })

  it('logs nothing for a click outside every button', () => {
    show('<p>No songs yet</p><button aria-label="Open folder"></button>')

    click('p')

    expect(loggedMessages()).toEqual([])
  })

  it('logs nothing once disconnected', () => {
    show('<button aria-label="Open menu"></button>')
    disconnectButtonLog()

    click('button')

    expect(loggedMessages()).toEqual([])
  })
})
