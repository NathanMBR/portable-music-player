import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ComponentProps, useState } from 'react'
import { expect, fn, waitFor } from 'storybook/test'
import { connectButtonLog } from '../../features/logging/buttonLog'
import { loggedMessages } from '../../testing/logs'
import { Button } from '../Button/Button'
import { StepTabs } from './StepTabs'

const DETAILS_STEP = { label: 'Details', content: <p>The playlist's title and description.</p> }
const SONGS_STEP = { label: 'Songs', content: <p>The songs to pick.</p> }
const STEPS = [DETAILS_STEP, SONGS_STEP]

/**
 * The tabs as a form uses them: its own Back and Next buttons move between the steps, and so do the
 * tabs when the form lets them.
 */
const SteppedForm = ({ onStepChange, ...props }: ComponentProps<typeof StepTabs>) => {
  const [stepIndex, setStepIndex] = useState(props.stepIndex)
  const changeStep = (index: number) => {
    setStepIndex(index)
    onStepChange?.(index)
  }
  return (
    <>
      <StepTabs {...props} stepIndex={stepIndex} onStepChange={onStepChange && changeStep} />
      <Button variant="quiet" onClick={() => setStepIndex(index => index - 1)}>
        Back
      </Button>
      <Button onClick={() => setStepIndex(index => index + 1)}>Next</Button>
    </>
  )
}

const meta = {
  component: StepTabs,
  args: { label: 'Playlist', tabs: STEPS, stepIndex: 0 },
  render: args => <SteppedForm {...args} />
} satisfies Meta<typeof StepTabs>

export default meta
type Story = StoryObj<typeof meta>

const indicatorIn = (canvasElement: HTMLElement) => {
  const indicator = canvasElement.querySelector<HTMLElement>('[data-step-indicator]')
  if (!indicator) {
    throw new Error('No step indicator')
  }
  return indicator
}

const isUnder = (indicator: HTMLElement, tab: HTMLElement) => {
  const indicatorBox = indicator.getBoundingClientRect()
  const tabBox = tab.getBoundingClientRect()
  return indicatorBox.left === tabBox.left && indicatorBox.width === tabBox.width
}

/**
 * The steps in a row above the current one's panel, the current step in pen with a pen bar under
 * it.
 */
export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    const details = canvas.getByRole('tab', { name: 'Details', selected: true })

    await expect(canvas.getByRole('tablist', { name: 'Playlist' })).toBeVisible()
    await expect(canvas.getByRole('tab', { name: 'Songs', selected: false })).toBeVisible()
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent(
      "The playlist's title and description."
    )
    await expect(isUnder(indicatorIn(canvasElement), details)).toBe(true)
  }
}

/** A later step, like the songs of a playlist once its title is given. */
export const LaterStep: Story = {
  args: { stepIndex: 1 },
  play: async ({ canvas, canvasElement }) => {
    const songs = canvas.getByRole('tab', { name: 'Songs', selected: true })

    await expect(canvas.getByRole('tabpanel')).toHaveTextContent('The songs to pick.')
    await expect(isUnder(indicatorIn(canvasElement), songs)).toBe(true)
  }
}

/**
 * Without `onStepChange`, as when creating a playlist, only the form's buttons move between the
 * steps: the tabs can't be clicked, the pointer shows the not-allowed cursor over them, and the
 * keyboard never stops on them.
 */
export const NotClickable: Story = {
  play: async ({ canvas, userEvent }) => {
    for (const tab of canvas.getAllByRole('tab')) {
      const box = tab.getBoundingClientRect()
      const pointed = tab.ownerDocument.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2
      )
      await expect(getComputedStyle(tab).pointerEvents).toBe('none')
      await expect(pointed && getComputedStyle(pointed).cursor).toBe('not-allowed')
    }

    await userEvent.tab()

    await expect(canvas.getByRole('button', { name: 'Back' })).toHaveFocus()
  }
}

/** Moving to another step slides the bar under it, rather than jumping. */
export const MovingBetweenSteps: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const indicator = indicatorIn(canvasElement)
    const { transitionProperty, transitionDuration } = getComputedStyle(indicator)
    await expect(transitionProperty).toMatch(/^transform/)
    await expect(transitionDuration).toBe('0.3s')

    await userEvent.click(canvas.getByRole('button', { name: 'Next' }))

    const songs = canvas.getByRole('tab', { name: 'Songs', selected: true })
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent('The songs to pick.')
    await waitFor(() => expect(isUnder(indicator, songs)).toBe(true))

    await userEvent.click(canvas.getByRole('button', { name: 'Back' }))

    const details = canvas.getByRole('tab', { name: 'Details', selected: true })
    await waitFor(() => expect(isUnder(indicator, details)).toBe(true))
  }
}

/**
 * Given `onStepChange`, as when editing a playlist, a click on a tab goes to its step, and the log
 * says which tab, like any button.
 */
export const Clickable: Story = {
  args: { onStepChange: fn() },
  beforeEach: () => connectButtonLog(),
  play: async ({ args, canvas, userEvent }) => {
    const songs = canvas.getByRole('tab', { name: 'Songs' })
    await expect(getComputedStyle(songs).cursor).toBe('pointer')

    await userEvent.click(songs)

    await expect(args.onStepChange).toHaveBeenCalledWith(1)
    await expect(canvas.getByRole('tab', { name: 'Songs', selected: true })).toBeVisible()
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent('The songs to pick.')
    await expect(loggedMessages()).toEqual(['Clicked at button "Songs"'])
  }
}

/**
 * Clickable tabs take the keyboard too: Tab reaches the current one, the arrows move between them
 * without leaving the step, and Enter goes to the focused one's step.
 */
export const ClickableFromTheKeyboard: Story = {
  args: { onStepChange: fn() },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.tab()
    await expect(canvas.getByRole('tab', { name: 'Details' })).toHaveFocus()

    await userEvent.keyboard('{ArrowRight}')

    const songs = canvas.getByRole('tab', { name: 'Songs', selected: false })
    await expect(songs).toHaveFocus()
    await expect(songs).toHaveAttribute('data-focus')
    await expect(args.onStepChange).not.toHaveBeenCalled()

    await userEvent.keyboard('{Enter}')

    await expect(args.onStepChange).toHaveBeenCalledWith(1)
    await expect(canvas.getByRole('tab', { name: 'Songs', selected: true })).toBeVisible()
  }
}

/** A step the form can't go to yet, like the songs of a playlist without a title, is disabled. */
export const ClickableWithAStepNotReady: Story = {
  args: {
    onStepChange: fn(),
    tabs: [DETAILS_STEP, { ...SONGS_STEP, isDisabled: true }]
  },
  play: async ({ args, canvas, userEvent }) => {
    const songs = canvas.getByRole('tab', { name: 'Songs' })
    await expect(songs).toBeDisabled()

    await userEvent.click(songs)

    await expect(args.onStepChange).not.toHaveBeenCalled()
    await expect(canvas.getByRole('tab', { name: 'Details', selected: true })).toBeVisible()
  }
}
