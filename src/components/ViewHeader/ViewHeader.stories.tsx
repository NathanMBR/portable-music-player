import {
  ArrowPathIcon,
  Cog6ToothIcon,
  MusicalNoteIcon,
  QueueListIcon
} from '@heroicons/react/20/solid'
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

/**
 * A page inside a category, like a playlist inside Playlists: a back button takes the icon's
 * place, named after where it goes back to.
 */
export const WithBackButton: Story = {
  args: {
    icon: QueueListIcon,
    title: 'Road trip',
    back: { label: 'Back to playlists', onClick: fn() }
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Back to playlists' }))

    await expect(args.back?.onClick).toHaveBeenCalledOnce()
  }
}

/** A title too long for its line wraps. */
export const LongTitle: Story = {
  args: {
    icon: QueueListIcon,
    title:
      'Everything for the long drive back home after the summer festival, in the order we heard it',
    back: { label: 'Back to playlists', onClick: fn() }
  }
}
