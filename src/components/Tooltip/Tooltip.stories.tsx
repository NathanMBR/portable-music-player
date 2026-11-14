import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { Tooltip } from './Tooltip'

// How far the tooltip keeps from the window's edges.
const COLLISION_PADDING = 8

// An anchor near an edge, but far enough from it for the arrow to reach it.
const NEAR_AN_EDGE = 30

const windowWidth = () => document.documentElement.clientWidth

const meta = {
  component: Tooltip,
  args: { text: '01:23.4', x: 160, y: 80 },
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof Tooltip>

export default meta
type Story = StoryObj<typeof meta>

type Placement = { tooltip: DOMRect; arrow: DOMRect }

// Retried until it holds: the tooltip may first show in the fallback font, and moves once the
// app's font loads and widens it.
const expectPlacement = async (
  canvasElement: HTMLElement,
  text: string,
  check: (placement: Placement) => Promise<void>
) => {
  const page = within(canvasElement.ownerDocument.body)
  const tooltip = await page.findByText(text)
  const arrow = tooltip.parentElement?.querySelector('svg')
  if (!arrow) throw new Error('The tooltip has no arrow')
  await waitFor(() =>
    check({ tooltip: tooltip.getBoundingClientRect(), arrow: arrow.getBoundingClientRect() })
  )
}

const centerX = (rect: DOMRect) => rect.left + rect.width / 2

/** Pointing at an anchor with room around it: the tooltip is centered above it, its arrow on it. */
export const PointingAtAPoint: Story = {
  play: async ({ args, canvasElement }) => {
    await expectPlacement(canvasElement, args.text, async ({ tooltip, arrow }) => {
      await expect(centerX(tooltip)).toBeCloseTo(args.x, 0)
      await expect(centerX(arrow)).toBeCloseTo(args.x, 0)
      await expect(arrow.bottom).toBeCloseTo(args.y, 0)
    })
  }
}

/** Near the window's left edge, the tooltip shifts inside it, and its arrow moves to the anchor. */
export const AtTheLeftEdge: Story = {
  args: { x: NEAR_AN_EDGE },
  play: async ({ args, canvasElement }) => {
    await expectPlacement(canvasElement, args.text, async ({ tooltip, arrow }) => {
      await expect(tooltip.left).toBeCloseTo(COLLISION_PADDING, 0)
      await expect(centerX(arrow)).toBeCloseTo(args.x, 0)
    })
  }
}

/** Near the window's right edge, the tooltip shifts inside it, and its arrow moves to the anchor. */
export const AtTheRightEdge: Story = {
  render: args => <Tooltip {...args} x={windowWidth() - NEAR_AN_EDGE} />,
  play: async ({ args, canvasElement }) => {
    await expectPlacement(canvasElement, args.text, async ({ tooltip, arrow }) => {
      await expect(tooltip.right).toBeCloseTo(windowWidth() - COLLISION_PADDING, 0)
      await expect(centerX(arrow)).toBeCloseTo(windowWidth() - NEAR_AN_EDGE, 0)
    })
  }
}
