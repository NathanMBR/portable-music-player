import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { ListRow } from './ListRow'

const meta = {
  component: ListRow,
  args: { children: 'Falling · Woodkid' },
  // Rows are list items, so they need a list around them.
  decorators: [
    Story => (
      <ul>
        <Story />
      </ul>
    )
  ]
} satisfies Meta<typeof ListRow>

export default meta
type Story = StoryObj<typeof meta>

/** A plain row, like most songs of the song list: thin rules above and below it. */
export const Default: Story = {}

/** The row under the mouse is tinted, so it's clear which one a click would act on. */
export const Hovered: Story = {
  play: async ({ canvas, userEvent }) => {
    const row = canvas.getByRole('listitem')
    await userEvent.hover(row)

    await expect(row).toHaveAttribute('data-hover')
  }
}

/**
 * The current row, like the song in the player, sits on a pen tint with its text in pen, and screen
 * readers hear it as the current one.
 */
export const Current: Story = {
  args: { children: 'Chop Suey! · System of a Down', isCurrent: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('listitem', { current: true })).toBeVisible()
  }
}

/** A row being dragged in a sortable list is lifted above the others, on a shadow. */
export const Lifted: Story = {
  args: { children: 'One · Metallica', isLifted: true }
}
