import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn } from 'storybook/test'
import { TextField } from './TextField'

const meta = {
  component: TextField,
  args: { label: 'Title', value: '', onChange: fn() }
} satisfies Meta<typeof TextField>

export default meta
type Story = StoryObj<typeof meta>

/** An empty box, named by its label. Each change hands over the new text. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole('textbox', { name: 'Title' }), 'R')

    await expect(args.onChange).toHaveBeenCalledWith('R')
  }
}

/** Holding what was typed, as its parent keeps it. */
export const Typing: Story = {
  render: args => {
    const [value, setValue] = useState('')
    return <TextField {...args} value={value} onChange={setValue} />
  },
  play: async ({ canvas, userEvent }) => {
    const box = canvas.getByRole('textbox', { name: 'Title' })

    await userEvent.type(box, 'Road trip')

    await expect(box).toHaveValue('Road trip')
  }
}

/** A required field, which screen readers announce as such. */
export const Required: Story = {
  args: { isRequired: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Title' })).toBeRequired()
  }
}

/** A search box, with faded text saying what it searches. */
export const Search: Story = {
  args: { label: 'Search songs', type: 'search', placeholder: 'Title, artist or file name' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('searchbox', { name: 'Search songs' })).toHaveAttribute(
      'placeholder',
      'Title, artist or file name'
    )
  }
}

/** It takes no more characters than its limit. */
export const WithALimit: Story = {
  args: { maxLength: 10 },
  render: args => {
    const [value, setValue] = useState('')
    return <TextField {...args} value={value} onChange={setValue} />
  },
  play: async ({ canvas, userEvent }) => {
    const box = canvas.getByRole('textbox', { name: 'Title' })

    await userEvent.type(box, 'Weekend at the lake')

    await expect(box).toHaveValue('Weekend at')
  }
}
