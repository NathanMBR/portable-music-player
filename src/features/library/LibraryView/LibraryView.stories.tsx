import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { noCover } from '../../../testing/covers'
import { mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { useSettingsStore } from '../../settings/settingsStore'
import type { SongOrder } from '../../settings/types'
import { useLibraryStore } from '../libraryStore'
import type { Track } from '../types'
import { LibraryView } from './LibraryView'

const TRACKS: Track[] = [
  { path: 'Songs/Metal Icarus.mp3', title: 'Metal Icarus', artist: 'Angra' },
  { path: 'Songs/Millennium Sun.mp3', title: 'Millennium Sun', artist: 'Angra' },
  { path: 'Songs/No Pain for the Dead.mp3', title: 'No Pain for the Dead', artist: 'Angra' },
  { path: 'Songs/Nothing To Say.mp3', title: 'Nothing To Say', artist: 'Angra' },
  { path: 'Songs/The Temple of Hate.mp3', title: 'The Temple of Hate', artist: 'Angra' }
]

const meta = {
  component: LibraryView,
  parameters: renderInOwnFrame(420),
  beforeEach: () => {
    mockCommands({
      load_music_library: () => TRACKS,
      open_songs_folder: () => undefined,
      read_cover: noCover
    })
  }
} satisfies Meta<typeof LibraryView>

export default meta
type Story = StoryObj<typeof meta>

/** The usual view: the header, then below its rule the song count and the song list. */
export const Loaded: Story = {
  beforeEach: () => {
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: TRACKS } })
  },
  play: async ({ canvas }) => {
    const content = within(canvas.getByRole('main'))
    await expect(content.getByText(`${TRACKS.length} songs`)).toBeVisible()
  }
}

/** Until the first scan finishes, only the header shows, so nothing flashes on launch. */
export const BeforeFirstScan: Story = {}

// The middle of the content column, between the gutters and above the bottom of the view.
const contentCenterOf = (content: HTMLElement) => {
  const { left, top } = content.getBoundingClientRect()
  const { paddingLeft, paddingRight } = getComputedStyle(content)
  const columnWidth = content.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight)
  return { x: left + parseFloat(paddingLeft) + columnWidth / 2, y: top + content.clientHeight / 2 }
}

const centerOf = (element: HTMLElement) => {
  const { left, top, width, height } = element.getBoundingClientRect()
  return { x: left + width / 2, y: top + height / 2 }
}

/** No songs in the Songs folder yet: in the middle of the view, a folder says where to put them. */
export const Empty: Story = {
  // Views fill the window's height, so the notice has room to center in.
  decorators: [
    Story => (
      <div className="h-96">
        <Story />
      </div>
    )
  ],
  beforeEach: () => {
    useLibraryStore.setState({ lastScan: { kind: 'loaded', tracks: [] } })
  },
  play: async ({ canvas }) => {
    const notice = canvas.getByRole('heading', { name: 'Your Songs folder is empty' })
    const contentCenter = contentCenterOf(canvas.getByRole('main'))
    const noticeCenter = centerOf(notice.parentElement as HTMLElement)

    await expect(noticeCenter.x).toBeCloseTo(contentCenter.x, 0)
    await expect(noticeCenter.y).toBeCloseTo(contentCenter.y, 0)
  }
}

/**
 * The scan failed: a notification gave Rust's reason, the view offers "Try again", and trying again
 * brings the songs back.
 */
export const ScanFailed: Story = {
  beforeEach: () => {
    useLibraryStore.setState({ lastScan: { kind: 'failed' } })
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }))
    await expect(await canvas.findByRole('list', { name: 'Songs' })).toBeVisible()
  }
}

const chooseSongOrder = (songOrder: SongOrder) =>
  useSettingsStore.setState(state => ({ settings: { ...state.settings, songOrder } }))

/**
 * Sorted by title, the default: the songs follow their titles, whatever their file names, and
 * whatever order the scan found them in.
 */
export const SortedByTitle: Story = {
  beforeEach: () => {
    chooseSongOrder('title')
    useLibraryStore.setState({
      lastScan: {
        kind: 'loaded',
        tracks: [
          { path: 'Songs/2 Shadows.mp3', title: 'Shadows', artist: 'Woodkid' },
          { path: 'Songs/1 Wuthering Heights.mp3', title: 'Wuthering Heights', artist: 'Angra' },
          { path: 'Songs/3 Hero of the Day.mp3', title: 'Hero of the Day', artist: 'Metallica' }
        ]
      }
    })
  },
  play: async ({ canvas }) => {
    const rows = canvas.getAllByRole('listitem').map(row => row.textContent)
    await expect(rows).toEqual([
      'Hero of the Day · Metallica',
      'Shadows · Woodkid',
      'Wuthering Heights · Angra'
    ])
  }
}

/** Sorted by file name, chosen in the settings: the songs follow their files, whatever their titles. */
export const SortedByFileName: Story = {
  beforeEach: () => {
    chooseSongOrder('fileName')
    useLibraryStore.setState({
      lastScan: {
        kind: 'loaded',
        tracks: [
          {
            path: 'Songs/3 Old School Hollywood.mp3',
            title: 'Old School Hollywood',
            artist: 'System of a Down'
          },
          { path: 'Songs/1 Sad but True.mp3', title: 'Sad but True', artist: 'Metallica' },
          { path: 'Songs/2 Out of Exile.mp3', title: 'Out of Exile', artist: 'Audioslave' }
        ]
      }
    })
  },
  play: async ({ canvas }) => {
    const rows = canvas.getAllByRole('listitem').map(row => row.textContent)
    await expect(rows).toEqual([
      'Sad but True · Metallica',
      'Out of Exile · Audioslave',
      'Old School Hollywood · System of a Down'
    ])
  }
}
