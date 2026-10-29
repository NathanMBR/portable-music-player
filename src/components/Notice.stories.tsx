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

/** For situations that aren't errors, like an empty Songs folder. */
export const NeutralTone: Story = {}

/** For failures: the title takes the `correction` color and the description carries Rust's error. */
export const ErrorTone: Story = {
  args: {
    tone: 'error',
    title: "Couldn't load your music",
    description:
      "Couldn't read the Songs folder at /media/usb/Songs: Permission denied (os error 13)"
  }
}

/** With a call to action under the description, so the user can fix the situation from here. */
export const WithAction: Story = {
  args: {
    ...ErrorTone.args,
    action: <Button onClick={fn()}>Try again</Button>
  }
}
