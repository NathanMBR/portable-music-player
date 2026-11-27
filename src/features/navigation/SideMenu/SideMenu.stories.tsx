import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { useUpdateStore } from '../../updates/updateStore'
import { MenuButton } from '../MenuButton/MenuButton'
import { useNavigationStore } from '../navigationStore'
import { SideMenu } from './SideMenu'

const openMenu = () => {
  useNavigationStore.setState({ isMenuOpen: true })
}

const offerUpdate = () => {
  useUpdateStore.setState({
    foundUpdate: { version: '0.2.0', notes: '## New features\n\n- Checks for updates' }
  })
}

const meta = {
  component: SideMenu,
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(520) },
  // A closed side menu renders nothing, so the stories also show the menu button that opens it,
  // with the same padding as in the app shell.
  decorators: [
    Story => (
      <>
        <div className="px-6 pt-8">
          <MenuButton />
        </div>
        <Story />
      </>
    )
  ],
  beforeEach: () => {
    mockCommands({ save_settings: () => undefined })
  }
} satisfies Meta<typeof SideMenu>

export default meta
type Story = StoryObj<typeof meta>

/** Closed, the drawer isn't rendered at all: only the menu button that opens it shows. */
export const Closed: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await expect(page.queryByRole('dialog')).not.toBeInTheDocument()
  }
}

/**
 * Open, the drawer slides over a dimmed page with the app's name, the categories, and the theme
 * toggle at the bottom. Its close button covers the menu button exactly.
 */
export const Open: Story = {
  beforeEach: openMenu,
  play: async ({ canvasElement }) => {
    // The drawer renders in a portal on <body>, outside the story's canvas.
    const page = within(canvasElement.ownerDocument.body)
    await expect(await page.findByRole('dialog', { name: 'Chopi' })).toBeVisible()
    await expect(page.queryByRole('button', { name: 'Update' })).not.toBeInTheDocument()
  }
}

/**
 * Once a check finds a newer release, an Update option follows the categories, with a dot on its
 * icon like the menu button's. It isn't a page, so it sits outside the categories' navigation.
 */
export const UpdateFound: Story = {
  beforeEach: () => {
    openMenu()
    offerUpdate()
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const update = await page.findByRole('button', { name: 'Update' })
    await expect(update).toBeVisible()
    await expect(update.querySelector('[data-notification-dot]')).toBeVisible()
    await expect(within(page.getByRole('navigation')).queryByText('Update')).toBeNull()
  }
}

/** Update opens the dialog of the update found, in place of the menu, which closes. */
export const OpeningTheUpdate: Story = {
  beforeEach: () => {
    openMenu()
    offerUpdate()
  },
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(await page.findByRole('button', { name: 'Update' }))

    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
    await expect(useUpdateStore.getState().isDialogOpen).toBe(true)
  }
}

/** The close button, in the same spot as the menu button, closes the drawer. */
export const ClosesWithTheCloseButton: Story = {
  beforeEach: openMenu,
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(await page.findByRole('button', { name: 'Close menu' }))
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
  }
}

/** Choosing a category switches the view and closes the drawer. */
export const ClosesWhenACategoryIsChosen: Story = {
  beforeEach: openMenu,
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(await page.findByRole('button', { name: 'Songs' }))
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
  }
}
