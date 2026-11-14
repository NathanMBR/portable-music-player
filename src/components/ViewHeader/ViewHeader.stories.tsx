import { ArrowPathIcon, Cog6ToothIcon, MusicalNoteIcon } from '@heroicons/react/20/solid'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { IconButton } from '../IconButton/IconButton'
import { ViewHeader } from './ViewHeader'

const meta = {
  component: ViewHeader,
  args: { icon: Cog6ToothIcon, title: 'Settings' }
} satisfies Meta<typeof ViewHeader>

export default meta
type Story = StoryObj<typeof meta>

/** Only the view's icon and title, like the Settings view's header. The title is the main heading. */
export const TitleOnly: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  }
}

/** Controls at the end of the title's line, like the Songs view's buttons. */
export const WithActions: Story = {
  args: {
    icon: MusicalNoteIcon,
    title: 'Songs',
    actions: <IconButton icon={ArrowPathIcon} label="Scan again" onClick={fn()} />
  }
}
