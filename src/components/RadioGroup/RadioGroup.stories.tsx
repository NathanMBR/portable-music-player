import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ComponentProps, useState } from 'react'
import { expect, fn } from 'storybook/test'
import { loggedMessages } from '../../testing/logs'
import { RadioGroup } from './RadioGroup'

/** The group as a form uses it: it keeps the value chosen last, and says so. */
const ChoosableGroup = ({
  value: firstValue,
  onChange,
  ...props
}: ComponentProps<typeof RadioGroup>) => {
  const [value, setValue] = useState(firstValue)
  const choose = (chosen: string) => {
    setValue(chosen)
    onChange(chosen)
  }
  return <RadioGroup {...props} value={value} onChange={choose} />
}

const meta = {
  component: RadioGroup,
  args: {
    label: 'Place it',
    options: [
      { value: 'before', label: 'Before' },
      { value: 'after', label: 'After' }
    ],
    value: 'before',
    onChange: fn(),
    isLabelShown: true
  },
  render: args => <ChoosableGroup {...args} />
} satisfies Meta<typeof RadioGroup>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A few short options on one line, after the group's label, like where the Change position
 * dialog places a song. The chosen one has a pen dot.
 */
export const Inline: Story = {
  play: async ({ canvas }) => {
    const before = canvas.getByRole('radio', { name: 'Before' })
    const after = canvas.getByRole('radio', { name: 'After' })

    await expect(canvas.getByRole('radiogroup', { name: 'Place it' })).toBeVisible()
    await expect(before).toBeChecked()
    await expect(before.getBoundingClientRect().top).toBe(after.getBoundingClientRect().top)
  }
}

/** A click on an option, its dot or its text, chooses it, and the log says which. */
export const Choosing: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByText('After'))

    await expect(canvas.getByRole('radio', { name: 'After' })).toBeChecked()
    await expect(args.onChange).toHaveBeenCalledWith('after')
    await expect(loggedMessages()).toEqual(['Radio group "Place it" set value to "After"'])
  }
}

/** From the keyboard, the arrows move to the next option and choose it, logged the same way. */
export const FromTheKeyboard: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.tab()
    await expect(canvas.getByRole('radio', { name: 'Before' })).toHaveFocus()

    await userEvent.keyboard('{ArrowRight}')

    await expect(canvas.getByRole('radio', { name: 'After' })).toBeChecked()
    await expect(args.onChange).toHaveBeenCalledWith('after')
    await expect(loggedMessages()).toEqual(['Radio group "Place it" set value to "After"'])
  }
}

/**
 * Options as the rows of a list, between thin rules, each with richer content, like the songs of
 * the Change position dialog. Nothing is chosen yet, and the group's label is only heard.
 */
export const Rows: Story = {
  args: {
    label: 'Songs',
    isLabelShown: false,
    layout: 'rows',
    value: null,
    options: [
      { value: 'Lease of Life.mp3', label: 'Lease of Life · Angra' },
      { value: 'Peephole.mp3', label: 'Peephole · System of a Down' },
      { value: 'In the Night.mp3', label: 'In the Night · Shaman' }
    ]
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole('radiogroup', { name: 'Songs' })).toBeVisible()
    await expect(canvas.queryByText('Songs')).toBeNull()
    await expect(
      canvas.getAllByRole('radio').filter(radio => radio.ariaChecked === 'true')
    ).toEqual([])

    await userEvent.click(canvas.getByRole('radio', { name: 'Peephole · System of a Down' }))

    await expect(args.onChange).toHaveBeenCalledWith('Peephole.mp3')
    await expect(loggedMessages()).toEqual([
      'Radio group "Songs" set value to "Peephole · System of a Down"'
    ])
  }
}
