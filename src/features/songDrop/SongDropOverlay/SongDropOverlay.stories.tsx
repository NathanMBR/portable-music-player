import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { useSongDropStore } from '../songDropStore'
import { SongDropOverlay } from './SongDropOverlay'

const meta = {
  component: SongDropOverlay,
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(360) },
  // The box covers the page, so the stories show a page under it, as in the app.
  decorators: [
    Story => (
      <>
        <div className="p-8">
          <h1 className="text-2xl font-extrabold text-ink">Songs</h1>
          <p className="mt-3 text-sm text-ink-faded">214 songs</p>
        </div>
        <Story />
      </>
    )
  ]
} satisfies Meta<typeof SongDropOverlay>

export default meta
type Story = StoryObj<typeof meta>

/** Files are dragged over the window: the page blurs, and the box over it says to drop them. */
export const Dragging: Story = {
  beforeEach: () => {
    useSongDropStore.setState({ isDragging: true })
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await expect(page.getByText('Drop files here')).toBeVisible()
  }
}

// Well within the box's fade, so it's still fading out then.
const WHILE_FADING_OUT_MS = 50

/** The files leave the window, or are dropped: the box fades out, then leaves the page. */
export const FadingOut: Story = {
  beforeEach: () => {
    useSongDropStore.setState({ isDragging: true })
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const message = await page.findByText('Drop files here')

    useSongDropStore.getState().setDragging(false)
    await new Promise(resolve => setTimeout(resolve, WHILE_FADING_OUT_MS))

    await expect(message).toBeInTheDocument()
    await waitFor(() => expect(page.queryByText('Drop files here')).not.toBeInTheDocument())
  }
}

/** Without a drag, or once the files leave the window or are dropped, nothing shows. */
export const NotDragging: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await expect(page.queryByText('Drop files here')).not.toBeInTheDocument()
  }
}

/**
 * While the songs of a drop are being added, a new drop is ignored, so files dragged over the
 * window show nothing.
 */
export const HiddenWhileAddingSongs: Story = {
  beforeEach: () => {
    useSongDropStore.setState({ isDragging: true, step: { kind: 'copying', songCount: 4 } })
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await expect(page.queryByText('Drop files here')).not.toBeInTheDocument()
  }
}
