import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { ScrollBox } from './ScrollBox'

// More than the box has room for.
const SONG_FILE_NAMES = [
  'In the Night.mp3',
  'Deus Le Volt!.mp3',
  'Set It Off.mp3',
  'Judgement Day.mp3',
  'Holy Mountains.mp3',
  'Jet Pilot.mp3',
  'Better than You.mp3',
  'Streamline.mp3',
  'Boom!.mp3',
  'Fixxxer.mp3'
]

// The box's border.
const BOX_BORDER_PX = 1

const meta = {
  component: ScrollBox,
  args: { label: 'Songs with the same name', as: 'ul', children: null },
  // As wide as a dialog's content.
  decorators: [
    Story => (
      <div className="w-96">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof ScrollBox>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A list longer than the box has room for, like the songs a drop would replace: it scrolls, its
 * scrollbar kept off the box's border, and the first Tab focuses it, so the arrow keys scroll it
 * too, with the focus ring around the whole box.
 */
export const LongList: Story = {
  args: {
    children: SONG_FILE_NAMES.map(name => (
      <li key={name} className="py-0.5">
        {name}
      </li>
    ))
  },
  play: async ({ canvas, userEvent }) => {
    const list = canvas.getByRole('list', { name: 'Songs with the same name' })
    await expect(within(list).getAllByRole('listitem')).toHaveLength(SONG_FILE_NAMES.length)
    await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight)
    // The scrollbar runs the height of the list: as far from the box's top as from its bottom, and
    // a little away from its right side.
    const box = list.parentElement as HTMLElement
    const boxArea = box.getBoundingClientRect()
    const scrollArea = list.getBoundingClientRect()
    await expect(scrollArea.top - boxArea.top).toBeCloseTo(boxArea.bottom - scrollArea.bottom)
    await expect(boxArea.right - scrollArea.right).toBeGreaterThan(BOX_BORDER_PX)

    await userEvent.tab()
    await expect(list).toHaveFocus()
    await expect(getComputedStyle(box).outlineStyle).toBe('solid')
  }
}

/** Content that isn't a list, like an update's patch notes, is a region named by the label. */
export const Region: Story = {
  args: {
    label: 'Patch notes',
    as: 'div',
    children: (
      <>
        <p>Checks for updates each time the app opens.</p>
        <p>Says why a disabled button can't act.</p>
      </>
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('region', { name: 'Patch notes' })).toHaveTextContent(
      'Checks for updates each time the app opens.'
    )
  }
}
