import { FolderIcon } from '@heroicons/react/20/solid'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { EmptyState } from './EmptyState'

const meta = {
  component: EmptyState,
  args: {
    icon: FolderIcon,
    title: 'Your Songs folder is empty',
    description: 'Copy .mp3 files into it, then scan again.'
  },
  // A view's content is a flex column at least as tall as the view, which the state fills.
  decorators: [
    Story => (
      <div className="flex h-80 flex-col">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

/** In the middle of the view: a large icon above what's missing and what to do about it. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Your Songs folder is empty' })
    ).toBeVisible()
  }
}

/** With nothing to do about it, like a playlist without songs, the title stands alone. */
export const TitleOnly: Story = {
  args: { title: 'No songs in this playlist', description: undefined }
}
