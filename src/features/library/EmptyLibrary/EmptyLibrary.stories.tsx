import type { Meta, StoryObj } from '@storybook/react-vite'
import { EmptyLibrary } from './EmptyLibrary'

const meta = {
  component: EmptyLibrary
} satisfies Meta<typeof EmptyLibrary>

export default meta
type Story = StoryObj<typeof meta>

/** What a first launch looks like: the Songs folder was just created and has no songs yet. */
export const Default: Story = {}
