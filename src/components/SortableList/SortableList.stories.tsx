import { arrayMove } from '@dnd-kit/sortable'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ComponentProps, useState } from 'react'
import { expect, fn, waitFor, within } from 'storybook/test'
import { SortableList, SortableRow } from './SortableList'
import { MOVE_INSTRUCTIONS } from './sortableAnnouncements'

const NAME_BY_ID: Record<string, string> = {
  'shortest-straw': 'The Shortest Straw',
  'mr-jack': 'Mr. Jack',
  'frayed-ends': 'The Frayed Ends of Sanity'
}

const nameOf = (id: string) => NAME_BY_ID[id] ?? id

/** The list as a page uses it: it keeps the order it's given, and each drop moves a row. */
const ReorderableList = ({
  ids: firstIds,
  onMove,
  ...props
}: ComponentProps<typeof SortableList>) => {
  const [ids, setIds] = useState(firstIds)
  const move = (from: number, to: number) => {
    setIds(arrayMove(ids, from, to))
    onMove(from, to)
  }

  return (
    <SortableList {...props} ids={ids} onMove={move}>
      {ids.map(id => (
        <SortableRow key={id} id={id} moveLabel={`Move ${nameOf(id)}`}>
          <span className="truncate">{nameOf(id)}</span>
        </SortableRow>
      ))}
    </SortableList>
  )
}

const rowNamesIn = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map(row => row.textContent)

const meta = {
  component: SortableList,
  args: {
    label: 'Songs',
    ids: Object.keys(NAME_BY_ID),
    nameOf,
    onMove: fn(),
    children: null
  },
  render: args => <ReorderableList {...args} />
} satisfies Meta<typeof SortableList>

export default meta
type Story = StoryObj<typeof meta>

/** Each row starts with its Move handle, which tells screen readers how to move the row. */
export const Default: Story = {
  play: async ({ canvas }) => {
    const handle = canvas.getByRole('button', { name: 'Move The Shortest Straw' })

    await expect(handle).toHaveAccessibleDescription(MOVE_INSTRUCTIONS.draggable)
  }
}

/**
 * From the keyboard, Space on a handle picks its row up, the arrows move it, and Space drops it.
 * Screen readers hear each step.
 */
export const MovingFromTheKeyboard: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    canvas.getByRole('button', { name: 'Move The Shortest Straw' }).focus()

    await userEvent.keyboard(' ')
    await waitFor(() =>
      expect(page.getByRole('status')).toHaveTextContent(
        'Picked up "The Shortest Straw", at position 1 of 3.'
      )
    )
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() =>
      expect(page.getByRole('status')).toHaveTextContent(
        '"The Shortest Straw" is at position 2 of 3.'
      )
    )
    await userEvent.keyboard(' ')

    await waitFor(() =>
      expect(page.getByRole('status')).toHaveTextContent(
        'Dropped "The Shortest Straw" at position 2 of 3.'
      )
    )
    await expect(args.onMove).toHaveBeenCalledOnce()
    await expect(args.onMove).toHaveBeenCalledWith(0, 1)
    await expect(rowNamesIn(canvas.getByRole('list', { name: 'Songs' }))).toEqual([
      'Mr. Jack',
      'The Shortest Straw',
      'The Frayed Ends of Sanity'
    ])
  }
}

/** A row moved away and back to its place is heard coming back. */
export const MovingBackFromTheKeyboard: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    canvas.getByRole('button', { name: 'Move Mr. Jack' }).focus()

    await userEvent.keyboard(' ')
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() =>
      expect(page.getByRole('status')).toHaveTextContent('"Mr. Jack" is at position 3 of 3.')
    )
    await userEvent.keyboard('{ArrowUp}')
    await waitFor(() =>
      expect(page.getByRole('status')).toHaveTextContent('"Mr. Jack" is back at position 2 of 3.')
    )
    await userEvent.keyboard(' ')

    await waitFor(() =>
      expect(page.getByRole('status')).toHaveTextContent('Dropped "Mr. Jack" at position 2 of 3.')
    )
    await expect(args.onMove).not.toHaveBeenCalled()
  }
}

/** Escape puts a row picked up from the keyboard back where it was. */
export const CancellingFromTheKeyboard: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    canvas.getByRole('button', { name: 'Move The Shortest Straw' }).focus()

    await userEvent.keyboard(' ')
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Escape}')

    await waitFor(() =>
      expect(page.getByRole('status')).toHaveTextContent(
        'Put "The Shortest Straw" back at position 1 of 3.'
      )
    )
    await expect(args.onMove).not.toHaveBeenCalled()
  }
}

/** With the pointer, a row dragged by its handle and dropped over another takes its place. */
export const MovingWithThePointer: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const handle = canvas.getByRole('button', { name: 'Move The Frayed Ends of Sanity' })
    const [firstRow] = canvas.getAllByRole('listitem')
    const start = handle.getBoundingClientRect()
    const target = firstRow?.getBoundingClientRect()
    if (!target) {
      throw new Error('The list has no rows')
    }
    const clientX = start.left + start.width / 2
    const startY = start.top + start.height / 2

    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: handle, coords: { clientX, clientY: startY } },
      { coords: { clientX, clientY: startY - 10 } },
      { coords: { clientX, clientY: target.top + target.height / 2 } },
      { keys: '[/MouseLeft]' }
    ])

    await waitFor(() => expect(args.onMove).toHaveBeenCalledOnce())
    await expect(args.onMove).toHaveBeenCalledWith(2, 0)
  }
}

/** A click on a handle that doesn't move the pointer leaves the row in its place. */
export const ClickingAHandle: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Move Mr. Jack' }))

    await expect(args.onMove).not.toHaveBeenCalled()
  }
}
