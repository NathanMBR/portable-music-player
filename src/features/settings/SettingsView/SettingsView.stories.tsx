import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, waitFor, within } from 'storybook/test'
import { failingCommand, mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { withNotificationArea } from '../../../testing/withNotificationArea'
import { useSettingsStore } from '../settingsStore'
import type { Settings } from '../types'
import { SettingsView } from './SettingsView'

const SAVE_ERROR =
  "Couldn't save the settings at /media/usb/settings.json: Read-only file system (os error 30)"

// What settings.rs gives when nothing was saved yet.
const DEFAULT_SETTINGS: Settings = {
  theme: null,
  checksForUpdates: true,
  songOrder: 'title',
  playback: {
    volume: 1,
    isMuted: false,
    repeatMode: 'off',
    isShuffled: false,
    song: null
  }
}

const UPDATES_SWITCH = { name: 'Search automatically for updates' }
const SONG_ORDER_SELECT = { name: /^Sort songs by/ }

const outlineStyleOf = (element: HTMLElement) => getComputedStyle(element).outlineStyle

const saveSettings = fn()

const meta = {
  component: SettingsView,
  parameters: renderInOwnFrame(360),
  beforeEach: () => {
    mockCommands({ save_settings: saveSettings })
  }
} satisfies Meta<typeof SettingsView>

export default meta
type Story = StoryObj<typeof meta>

/** Until the user changes them, updates are searched for automatically and songs sort by title. */
export const Defaults: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(canvas.getByRole('switch', UPDATES_SWITCH)).toBeChecked()
    await expect(canvas.getByRole('button', SONG_ORDER_SELECT)).toHaveTextContent(
      'Title (if existing)'
    )
  }
}

/** The choices saved in settings.json show as they were left. */
export const SavedChoices: Story = {
  beforeEach: () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, checksForUpdates: false, songOrder: 'fileName' }
    })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('switch', UPDATES_SWITCH)).not.toBeChecked()
    await expect(canvas.getByRole('button', SONG_ORDER_SELECT)).toHaveTextContent('Filename')
  }
}

/** Turning off the search for updates saves the choice to settings.json at once. */
export const TurnsOffTheSearchForUpdates: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('switch', UPDATES_SWITCH))

    await expect(canvas.getByRole('switch', UPDATES_SWITCH)).not.toBeChecked()
    await waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith({
        settings: { ...DEFAULT_SETTINGS, checksForUpdates: false }
      })
    )
  }
}

/** Choosing to sort by filename saves the choice at once; the Songs view follows it. */
export const SortsByFileName: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', SONG_ORDER_SELECT))
    await userEvent.click(await page.findByRole('option', { name: 'Filename' }))

    await expect(canvas.getByRole('button', SONG_ORDER_SELECT)).toHaveTextContent('Filename')
    await waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith({
        settings: { ...DEFAULT_SETTINGS, songOrder: 'fileName' }
      })
    )
  }
}

/** If settings.json can't be written, the choice still applies and a notification says why. */
export const SaveFails: Story = {
  parameters: renderInOwnFrame(440),
  decorators: [withNotificationArea],
  beforeEach: () => {
    mockCommands({ save_settings: failingCommand(SAVE_ERROR) })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', SONG_ORDER_SELECT))
    await userEvent.click(await page.findByRole('option', { name: 'Filename' }))

    await expect(canvas.getByRole('button', SONG_ORDER_SELECT)).toHaveTextContent('Filename')
    await waitFor(() => expect(page.getByText(SAVE_ERROR)).toBeVisible())
  }
}

/**
 * Clicking an option's label draws no focus ring on its control: the label only names the control,
 * and the ring is for the keyboard.
 */
export const ClickingALabelDrawsNoFocusRing: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText('Search automatically for updates'))
    await expect(outlineStyleOf(canvas.getByRole('switch', UPDATES_SWITCH))).toBe('none')

    await userEvent.click(canvas.getByText('Sort songs by'))
    await expect(outlineStyleOf(canvas.getByRole('button', SONG_ORDER_SELECT))).toBe('none')
  }
}

/** The option cards span the whole width between the side margins, like the header above them. */
export const CardsFillTheWidth: Story = {
  play: async ({ canvas }) => {
    const header = canvas.getByRole('heading', { name: 'Settings' }).closest('header')
    const headerBox = (header as HTMLElement).getBoundingClientRect()

    for (const label of ['Search automatically for updates', 'Sort songs by']) {
      const cardBox = (canvas.getByText(label).parentElement as HTMLElement).getBoundingClientRect()
      await expect(cardBox.left).toBeCloseTo(headerBox.left, 0)
      await expect(cardBox.right).toBeCloseTo(headerBox.right, 0)
    }
  }
}
