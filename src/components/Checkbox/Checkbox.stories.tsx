import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn } from 'storybook/test'
import { loggedMessages } from '../../testing/logs'
import { ListRow } from '../ListRow/ListRow'
import { Checkbox } from './Checkbox'

const meta = {
  component: Checkbox,
  args: { checked: false, onChange: fn(), children: 'My Friend of Misery · Metallica' }
} satisfies Meta<typeof Checkbox>

export default meta
type Story = StoryObj<typeof meta>

/** Unchecked: an empty square in a faded border, before what it's for. */
export const Unchecked: Story = {}

/** Checked: the square is filled with pen and a check mark. */
export const Checked: Story = {
  args: { checked: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('checkbox', { name: 'My Friend of Misery · Metallica' })
    ).toBeChecked()
  }
}

/** Clicking what's beside the box toggles it too, and hands over the new state. */
export const Toggles: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByText('My Friend of Misery · Metallica'))

    await expect(args.onChange).toHaveBeenCalledWith(true)
  }
}

/** Space toggles it from the keyboard, which shows the focus ring around the box. */
export const FromTheKeyboard: Story = {
  render: args => {
    const [checked, setChecked] = useState(false)
    return <Checkbox {...args} checked={checked} onChange={setChecked} />
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab()
    await userEvent.keyboard(' ')

    await expect(
      canvas.getByRole('checkbox', { name: 'My Friend of Misery · Metallica' })
    ).toBeChecked()
  }
}

/** Each toggle is logged by what's beside the box, with the new state. */
export const LogsItsToggles: Story = {
  args: { children: 'Late Redemption · Angra' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Late Redemption · Angra' }))

    await expect(loggedMessages()).toEqual(['"Late Redemption · Angra" is on'])
  }
}

/**
 * In a list's row, like a song of the New playlist dialog, the box sits where the row's padding
 * ends, with no room of its own added before it.
 */
export const InAListRow: Story = {
  args: { children: 'Question! · System of a Down' },
  render: args => (
    <ul>
      <ListRow>
        <Checkbox {...args} />
      </ListRow>
    </ul>
  ),
  play: async ({ canvas }) => {
    const row = canvas.getByRole('listitem')
    const box = canvas.getByRole('checkbox').firstElementChild
    if (!box) {
      throw new Error('The checkbox has no box')
    }

    await expect(box.getBoundingClientRect().left - row.getBoundingClientRect().left).toBe(
      Number.parseFloat(getComputedStyle(row).paddingLeft)
    )
  }
}
