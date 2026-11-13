import { Field, Label } from '@headlessui/react'
import { MoonIcon } from '@heroicons/react/16/solid'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { Switch } from './Switch'

const SWITCH_NAME = 'Search automatically for updates'

const outlineStyleOf = (element: HTMLElement) => getComputedStyle(element).outlineStyle

const meta = {
  component: Switch,
  args: { checked: false, label: SWITCH_NAME, onChange: fn() }
} satisfies Meta<typeof Switch>

export default meta
type Story = StoryObj<typeof meta>

/** Off: a faded track, with the knob at the left. */
export const Off: Story = {}

/** On: a pen track, with the knob slid to the right. */
export const On: Story = {
  args: { checked: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('switch', { name: 'Search automatically for updates' })
    ).toBeChecked()
  }
}

/** The knob can carry an icon, like the theme toggle's moon. */
export const WithKnobIcon: Story = {
  args: { checked: true, label: 'Dark theme', knobIcon: MoonIcon }
}

/** Clicking it hands over the opposite state; the parent decides what it shows. */
export const Toggles: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('switch', { name: 'Search automatically for updates' }))
    await expect(args.onChange).toHaveBeenCalledWith(true)
  }
}

/**
 * Inside a Headless UI `Field`, a visible `Label` names the switch, so it needs no `label`, like the
 * Settings view's options. Made `passive`, the label only names it: clicking a Headless label hands
 * the switch a synthetic click, which Headless takes for a screen reader's and answers with the
 * focus ring.
 */
export const NamedByAVisibleLabel: Story = {
  args: { label: undefined },
  render: args => (
    <Field className="flex items-center gap-3">
      <Label passive className="text-ink">
        {SWITCH_NAME}
      </Label>
      <Switch {...args} />
    </Field>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('switch', { name: SWITCH_NAME })).toBeInTheDocument()
  }
}

/** Clicking the switch draws no focus ring: the ring is for the keyboard. */
export const ClickingDrawsNoFocusRing: Story = {
  play: async ({ canvas, userEvent }) => {
    const control = canvas.getByRole('switch', { name: SWITCH_NAME })

    await userEvent.click(control)

    await expect(outlineStyleOf(control)).toBe('none')
  }
}

/** Reached from the keyboard, the switch shows the pen focus ring. */
export const KeyboardFocusDrawsTheRing: Story = {
  play: async ({ canvas, userEvent }) => {
    const control = canvas.getByRole('switch', { name: SWITCH_NAME })

    await userEvent.tab()

    await expect(control).toHaveFocus()
    await expect(outlineStyleOf(control)).toBe('solid')
  }
}
