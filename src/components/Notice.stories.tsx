import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Button } from './Button'
import { Notice } from './Notice'

const meta = {
  component: Notice,
  args: {
    title: 'Your Songs folder is empty',
    description: 'Copy .mp3 files into it, then scan again.'
  },
  argTypes: { action: { control: false } }
} satisfies Meta<typeof Notice>

export default meta
type Story = StoryObj<typeof meta>

/** Fills a view that has nothing to show, like an empty Songs folder. */
export const Default: Story = {}

/** With a call to action under the description, so the user can fix the situation from here. */
export const WithAction: Story = {
  args: {
    title: "Couldn't load your music",
    description: 'Check that the drive is still connected, then try again.',
    action: <Button onClick={fn()}>Try again</Button>
  }
}
