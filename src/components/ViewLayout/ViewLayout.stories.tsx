import { Cog6ToothIcon } from '@heroicons/react/20/solid'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { Button } from '../Button/Button'
import { ViewHeader } from '../ViewHeader/ViewHeader'
import { ViewLayout } from './ViewLayout'

const ROW_LABELS = Array.from({ length: 30 }, (_, index) => `Row ${index + 1}`)

const meta = {
  component: ViewLayout,
  // Views fill the window's height; here, a short window.
  decorators: [
    Story => (
      <div className="h-80">
        <Story />
      </div>
    )
  ],
  args: {
    header: <ViewHeader icon={Cog6ToothIcon} title="Settings" />,
    children: (
      // Rows of controls, like the song list's play buttons, so the keyboard reaches all of it.
      <div className="flex flex-col items-start gap-2 py-4">
        {ROW_LABELS.map(label => (
          <Button key={label} variant="outlined" onClick={fn()}>
            {label}
          </Button>
        ))}
      </div>
    )
  }
} satisfies Meta<typeof ViewLayout>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Content taller than the view scrolls on its own, with the scrollbar in the right margin, while
 * the header stays in place above it.
 */
export const ScrollsOnlyTheContent: Story = {
  play: async ({ canvas }) => {
    const content = canvas.getByRole('main')
    const header = canvas.getByRole('heading', { name: 'Settings' })
    const headerTop = header.getBoundingClientRect().top

    await expect(content.scrollHeight).toBeGreaterThan(content.clientHeight)
    content.scrollTop = content.scrollHeight

    await expect(content.scrollTop).toBeGreaterThan(0)
    await expect(header.getBoundingClientRect().top).toBe(headerTop)
  }
}

/** Content that fits doesn't scroll, and the hidden scrollbar keeps its room, so nothing widens. */
export const ContentThatFits: Story = {
  args: { children: <p className="py-4">Short content</p> }
}
