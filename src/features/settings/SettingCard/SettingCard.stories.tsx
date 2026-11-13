import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { Select } from '../../../components/Select/Select'
import { Switch } from '../../../components/Switch/Switch'
import { SettingCard } from './SettingCard'

const UPDATES_LABEL = 'Search automatically for updates'
const SONG_ORDER_LABEL = 'Sort songs by'

const verticalMiddleOf = ({ top, height }: DOMRect) => top + height / 2

// The label hugs the card's left side and the control its right one, as far in from each, and
// the middles of the label, the control and the card line up.
const expectLabelLeftAndControlRight = async (label: HTMLElement, control: HTMLElement) => {
  const card = label.parentElement as HTMLElement
  const cardBox = card.getBoundingClientRect()
  const labelBox = label.getBoundingClientRect()
  const controlBox = control.getBoundingClientRect()

  await expect(labelBox.right).toBeLessThan(controlBox.left)
  await expect(labelBox.left - cardBox.left).toBeCloseTo(cardBox.right - controlBox.right, 0)
  await expect(verticalMiddleOf(labelBox)).toBeCloseTo(verticalMiddleOf(cardBox), 0)
  await expect(verticalMiddleOf(controlBox)).toBeCloseTo(verticalMiddleOf(cardBox), 0)
}

const meta = {
  component: SettingCard,
  args: {
    label: UPDATES_LABEL,
    children: <Switch checked onChange={fn()} />
  }
} satisfies Meta<typeof SettingCard>

export default meta
type Story = StoryObj<typeof meta>

/** An on/off option: the label at the left names the switch at the right. */
export const WithASwitch: Story = {
  play: async ({ canvas }) => {
    const control = canvas.getByRole('switch', { name: UPDATES_LABEL })

    await expectLabelLeftAndControlRight(canvas.getByText(UPDATES_LABEL), control)
  }
}

/**
 * An option with a few choices: the select at the right is taller than the switch, and the label
 * still sits on the card's middle.
 */
export const WithASelect: Story = {
  args: {
    label: SONG_ORDER_LABEL,
    children: (
      <Select
        options={[
          { value: 'fileName', label: 'Filename' },
          { value: 'title', label: 'Title (if existing)' }
        ]}
        value="title"
        onChange={fn()}
      />
    )
  },
  play: async ({ canvas }) => {
    const control = canvas.getByRole('button', { name: new RegExp(`^${SONG_ORDER_LABEL}`) })

    await expectLabelLeftAndControlRight(canvas.getByText(SONG_ORDER_LABEL), control)
  }
}
