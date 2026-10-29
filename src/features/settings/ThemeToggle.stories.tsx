import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, waitFor } from 'storybook/test'
import { failingCommand, mockCommands } from '../../testing/mockCommands'
import { renderInOwnFrame } from '../../testing/storyParameters'
import { useSettingsStore } from './settingsStore'
import { ThemeToggle } from './ThemeToggle'

const SAVE_ERROR =
  "Couldn't save the settings at /media/usb/settings.json: Read-only file system (os error 30)"

const saveSettings = fn()

const meta = {
  component: ThemeToggle,
  parameters: renderInOwnFrame(140),
  globals: { theme: 'light' },
  beforeEach: () => {
    mockCommands({ save_settings: saveSettings })
    useSettingsStore.setState({ theme: 'light' })
  }
} satisfies Meta<typeof ThemeToggle>

export default meta
type Story = StoryObj<typeof meta>

/** Light theme: the switch is off and its knob shows a sun. */
export const Light: Story = {}

/** Dark theme: the switch is on and its knob shows a moon. */
export const Dark: Story = {
  globals: { theme: 'dark' },
  beforeEach: () => {
    useSettingsStore.setState({ theme: 'dark' })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('switch', { name: 'Dark theme' })).toBeChecked()
  }
}

/** Turning the switch on applies the dark theme at once and saves it to settings.json. */
export const SwitchesToDark: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('switch', { name: 'Dark theme' }))
    await expect(canvasElement.ownerDocument.documentElement.dataset.theme).toBe('dark')
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith({ settings: { theme: 'dark' } }))
  }
}

/** If settings.json can't be written, the theme still changes and the error shows below. */
export const SaveFails: Story = {
  beforeEach: () => {
    mockCommands({ save_settings: failingCommand(SAVE_ERROR) })
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('switch', { name: 'Dark theme' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(SAVE_ERROR)
  }
}
