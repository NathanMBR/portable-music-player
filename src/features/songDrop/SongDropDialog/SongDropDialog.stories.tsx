import type { Meta, StoryObj } from '@storybook/react-vite'
import type { InvokeArgs } from '@tauri-apps/api/core'
import { expect, fn, waitFor, within } from 'storybook/test'
import { mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { withNotificationArea } from '../../../testing/withNotificationArea'
import { useLibraryStore } from '../../library/libraryStore'
import type { Track } from '../../library/types'
import { useNavigationStore } from '../../navigation/navigationStore'
import { SideMenu } from '../../navigation/SideMenu/SideMenu'
import { useSongDropStore } from '../songDropStore'
import type { DroppedSongs } from '../types'
import { SongDropDialog } from './SongDropDialog'

const DROPPED_PATHS = ['/home/user/Music/More.mp3', '/home/user/Music/Audioslave']

const TWO_NAMES_TAKEN: DroppedSongs = {
  songCount: 4,
  conflicts: ['More.mp3', 'Hypnotize.mp3'],
  failures: []
}

const TRACKS: Track[] = [
  { path: 'Songs/More.mp3', title: 'More', artist: 'Shaman' },
  { path: 'Songs/Hypnotize.mp3', title: 'Hypnotize', artist: 'Audioslave' },
  { path: 'Songs/Fade to Black.mp3', title: 'Fade to Black', artist: 'Metallica' },
  { path: 'Songs/No Remorse.mp3', title: 'No Remorse', artist: 'Metallica' },
  { path: 'Songs/Dandelion.mp3', title: 'Dandelion', artist: 'Audioslave' }
]

const copyDroppedSongs = fn((_args?: InvokeArgs) => ({ copiedCount: 2, failures: [] }))

const askAbout = (droppedSongs: DroppedSongs) => {
  useSongDropStore.setState({ step: { kind: 'asking', paths: DROPPED_PATHS, droppedSongs } })
}

const meta = {
  component: SongDropDialog,
  parameters: { layout: 'fullscreen', ...renderInOwnFrame(400) },
  beforeEach: () => {
    mockCommands({
      copy_dropped_songs: copyDroppedSongs,
      load_music_library: () => TRACKS
    })
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: TRACKS.slice(0, 3) } })
  }
} satisfies Meta<typeof SongDropDialog>

export default meta
type Story = StoryObj<typeof meta>

/** Just dropped, while Rust looks for the songs in the files and folders, a loader spins. */
export const LookingForSongs: Story = {
  beforeEach: () => {
    useSongDropStore.setState({ step: { kind: 'checking' } })
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await expect(await page.findByRole('dialog', { name: 'Adding songs' })).toBeVisible()
    await expect(page.getByText('Looking for songs…')).toBeVisible()
  }
}

/** While the songs are copied, and the Songs folder scanned again after, it counts them. */
export const CopyingSongs: Story = {
  beforeEach: () => {
    useSongDropStore.setState({ step: { kind: 'copying', songCount: 4 } })
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await expect(await page.findByText('Copying 4 songs to the Songs folder…')).toBeVisible()
  }
}

/** Songs being copied can't be stopped: Escape leaves the dialog open. */
export const CopyingCantBeCanceled: Story = {
  beforeEach: () => {
    useSongDropStore.setState({ step: { kind: 'copying', songCount: 4 } })
  },
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    await page.findByRole('dialog', { name: 'Adding songs' })

    await userEvent.keyboard('{Escape}')

    await expect(page.getByRole('dialog', { name: 'Adding songs' })).toBeVisible()
  }
}

/**
 * Some dropped songs have the file name of a song already in the Songs folder, or of another
 * dropped song: before copying anything, it asks what to do with them, naming them.
 */
export const AskingAboutTakenNames: Story = {
  beforeEach: () => askAbout(TWO_NAMES_TAKEN),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const dialog = await page.findByRole('dialog', { name: 'Replace songs with the same name?' })
    await expect(dialog).toHaveAccessibleDescription(
      '2 of the 4 dropped songs would replace songs with the same file names:'
    )
    await expect(page.getByText('More.mp3')).toBeVisible()
    await expect(page.getByText('Hypnotize.mp3')).toBeVisible()
  }
}

/** With many taken names, it names a few and counts the others. */
export const ManyTakenNames: Story = {
  beforeEach: () =>
    askAbout({
      songCount: 7,
      conflicts: [
        'More.mp3',
        'Hypnotize.mp3',
        'Fade to Black.mp3',
        'No Remorse.mp3',
        'Dandelion.mp3',
        'Never Understand.mp3',
        'Gate XIII.mp3'
      ],
      failures: []
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await expect(await page.findByText('and 2 more')).toBeVisible()
    await expect(page.queryByText('Never Understand.mp3')).not.toBeInTheDocument()
  }
}

/**
 * "Skip them" copies the other songs and leaves the songs already there as they are, then the
 * Songs folder is scanned again, which notifies.
 */
export const SkippingTakenNames: Story = {
  decorators: [withNotificationArea],
  beforeEach: () => askAbout(TWO_NAMES_TAKEN),
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(await page.findByRole('button', { name: 'Skip them' }))

    await expect(copyDroppedSongs).toHaveBeenCalledOnce()
    await expect(copyDroppedSongs).toHaveBeenCalledWith({
      paths: DROPPED_PATHS,
      onConflict: 'skip'
    })
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(page.getByText('Song list updated')).toBeVisible())
  }
}

/** "Replace them" copies every dropped song, putting each in place of the one of its name. */
export const ReplacingTakenNames: Story = {
  beforeEach: () => askAbout(TWO_NAMES_TAKEN),
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(await page.findByRole('button', { name: 'Replace them' }))

    await expect(copyDroppedSongs).toHaveBeenCalledOnce()
    await expect(copyDroppedSongs).toHaveBeenCalledWith({
      paths: DROPPED_PATHS,
      onConflict: 'replace'
    })
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
  }
}

/** "Cancel" closes the dialog without copying anything, like Escape or a click outside. */
export const CancelingCopiesNothing: Story = {
  beforeEach: () => askAbout(TWO_NAMES_TAKEN),
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(await page.findByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument())
    await expect(copyDroppedSongs).not.toHaveBeenCalled()
  }
}

/** Songs dropped while the side menu is open: the dialog opens above it, and answers. */
export const OverTheSideMenu: Story = {
  decorators: [
    Story => (
      <>
        <SideMenu />
        <Story />
      </>
    )
  ],
  beforeEach: () => {
    mockCommands({ copy_dropped_songs: copyDroppedSongs, load_music_library: () => TRACKS })
    useNavigationStore.setState({ isMenuOpen: true })
    askAbout(TWO_NAMES_TAKEN)
  },
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(await page.findByRole('button', { name: 'Skip them' }))

    await expect(copyDroppedSongs).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(
        page.queryByRole('dialog', { name: 'Replace songs with the same name?' })
      ).not.toBeInTheDocument()
    )
  }
}
