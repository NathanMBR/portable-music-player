import { Field, Label } from '@headlessui/react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, waitFor, within } from 'storybook/test'
import { Select } from './Select'

const SELECT_NAME = /^Sort songs by/

const outlineStyleOf = (element: HTMLElement) => getComputedStyle(element).outlineStyle

const meta = {
  component: Select,
  // A Headless UI Label in the same Field names the select, as in the Settings view.
  decorators: [
    Story => (
      <Field className="flex items-center gap-3">
        <Label passive>Sort songs by</Label>
        <Story />
      </Field>
    )
  ],
  args: {
    options: [
      { value: 'fileName', label: 'Filename' },
      { value: 'title', label: 'Title (if existing)' }
    ],
    value: 'title',
    onChange: fn()
  }
} satisfies Meta<typeof Select>

export default meta
type Story = StoryObj<typeof meta>

/** Closed, it shows the chosen option, and the label beside it names it. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: SELECT_NAME })).toHaveTextContent(
      'Title (if existing)'
    )
  }
}

/** Opened, it lists every option below it, with the chosen one marked. */
export const Open: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', { name: SELECT_NAME }))

    await expect(await page.findByRole('listbox')).toBeVisible()
    await expect(page.getByRole('option', { name: 'Title (if existing)' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(page.getByRole('option', { name: 'Filename' })).toHaveAttribute(
      'aria-selected',
      'false'
    )
  }
}

/** Clicking an option chooses it and closes the list. */
export const ChoosesAnOption: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', { name: SELECT_NAME }))
    await userEvent.click(await page.findByRole('option', { name: 'Filename' }))

    await expect(args.onChange).toHaveBeenCalledWith('fileName')
    await waitFor(() => expect(page.queryByRole('listbox')).not.toBeInTheDocument())
  }
}

/** From the keyboard: the down arrow opens the list, the arrows move through it, and Enter chooses. */
export const ChoosesWithTheKeyboard: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.tab()
    await expect(canvas.getByRole('button', { name: SELECT_NAME })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    await page.findByRole('listbox')
    await userEvent.keyboard('{ArrowUp}{Enter}')

    await expect(args.onChange).toHaveBeenCalledWith('fileName')
  }
}

/** Choosing with the pointer draws no focus ring on the select once the list closes. */
export const ChoosingWithThePointerDrawsNoFocusRing: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    const select = canvas.getByRole('button', { name: SELECT_NAME })

    await userEvent.click(select)
    await userEvent.click(await page.findByRole('option', { name: 'Filename' }))
    await waitFor(() => expect(page.queryByRole('listbox')).not.toBeInTheDocument())

    await expect(outlineStyleOf(select)).toBe('none')
  }
}

/** Reached from the keyboard, the select shows the pen focus ring. */
export const KeyboardFocusDrawsTheRing: Story = {
  play: async ({ canvas, userEvent }) => {
    const select = canvas.getByRole('button', { name: SELECT_NAME })

    await userEvent.tab()

    await expect(select).toHaveFocus()
    await expect(outlineStyleOf(select)).toBe('solid')
  }
}
