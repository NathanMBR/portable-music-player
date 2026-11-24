import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { untilBrowserPointerSettles } from '../../../testing/browserPointer'
import { failingCommand, mockCommands } from '../../../testing/mockCommands'
import { renderInOwnFrame } from '../../../testing/storyParameters'
import { withNotificationArea } from '../../../testing/withNotificationArea'
import { useSettingsStore } from '../../settings/settingsStore'
import type { FoundUpdate } from '../types'
import { useUpdateStore } from '../updateStore'
import { CheckForUpdatesButton } from './CheckForUpdatesButton'

const CHECK_BUTTON = { name: 'Check for updates' }
const CHECKING_BUTTON = { name: 'Checking for updates…' }
const AUTOMATIC_CHECKS_REASON = 'Disabled while automatic update checks are on'

const CHECK_ERROR =
  "Couldn't read the latest release on GitHub: Could not fetch a valid release JSON from the remote"

const NEW_VERSION: FoundUpdate = {
  version: '0.2.0',
  notes: '## New features\n\n- Checks for updates from the Settings page'
}

// The reason is also in the page as the button's description, hidden, apart from the tooltip.
const TOOLTIP_TEXT = { ignore: '[hidden]' }

// A disabled button lets the pointer through to what wraps it, which shows the tooltip.
const hoverAreaOf = (button: HTMLElement) => button.parentElement as HTMLElement

// Answers the check a story started, to see the button while the check runs.
let answerCheck: (foundUpdate: FoundUpdate) => void = () => undefined

const turnOffAutomaticChecks = () => {
  useSettingsStore.setState(state => ({
    settings: { ...state.settings, checksForUpdates: false }
  }))
}

const meta = {
  component: CheckForUpdatesButton,
  decorators: [withNotificationArea],
  parameters: renderInOwnFrame(160)
} satisfies Meta<typeof CheckForUpdatesButton>

export default meta
type Story = StoryObj<typeof meta>

/**
 * While automatic update checks are on, the app checks each time it opens, so the button is
 * disabled, and says why in a tooltip while the pointer is over it.
 */
export const DisabledWhileAutomaticChecksAreOn: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)
    const button = canvas.getByRole('button', CHECK_BUTTON)
    await expect(button).toBeDisabled()
    await expect(button).toHaveAccessibleDescription(AUTOMATIC_CHECKS_REASON)
    await untilBrowserPointerSettles()

    await userEvent.hover(hoverAreaOf(button))

    await expect(page.getByText(AUTOMATIC_CHECKS_REASON, TOOLTIP_TEXT)).toBeVisible()
  }
}

/** With automatic update checks off, the button checks when clicked. */
export const EnabledWhileAutomaticChecksAreOff: Story = {
  beforeEach: turnOffAutomaticChecks,
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', CHECK_BUTTON)
    await expect(button).toBeEnabled()
    await expect(button).not.toHaveAccessibleDescription()
  }
}

/**
 * While a check runs, the button says so and can't be clicked again; once the check finds a newer
 * release, the app offers it from the side menu.
 */
export const CheckingWhenClicked: Story = {
  beforeEach: () => {
    turnOffAutomaticChecks()
    mockCommands({
      check_for_update: () =>
        new Promise<FoundUpdate>(resolve => {
          answerCheck = resolve
        })
    })
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', CHECK_BUTTON))

    await expect(await canvas.findByRole('button', CHECKING_BUTTON)).toBeDisabled()
    answerCheck(NEW_VERSION)
    await waitFor(() => expect(canvas.getByRole('button', CHECK_BUTTON)).toBeEnabled())
    await expect(useUpdateStore.getState().foundUpdate).toEqual(NEW_VERSION)
  }
}

/**
 * The check the app makes as it opens shows on the button too, which stays disabled, since
 * automatic update checks are on.
 */
export const CheckingAtLaunch: Story = {
  beforeEach: () => {
    useUpdateStore.setState({ isChecking: true })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', CHECKING_BUTTON)).toBeDisabled()
  }
}

/** A check that finds nothing newer says so, since nothing else on screen would change. */
export const NoUpdateFound: Story = {
  beforeEach: () => {
    turnOffAutomaticChecks()
    mockCommands({ check_for_update: () => null })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', CHECK_BUTTON))

    await waitFor(() => expect(page.getByText('No update found')).toBeVisible())
    await expect(page.getByText('You have the latest version.')).toBeVisible()
  }
}

/** A check that fails, like on a computer without internet, notifies why. */
export const FailedCheck: Story = {
  beforeEach: () => {
    turnOffAutomaticChecks()
    mockCommands({ check_for_update: failingCommand(CHECK_ERROR) })
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body)

    await userEvent.click(canvas.getByRole('button', CHECK_BUTTON))

    await waitFor(() => expect(page.getByText("Couldn't check for updates")).toBeVisible())
    await expect(page.getByText(CHECK_ERROR)).toBeVisible()
    await expect(canvas.getByRole('button', CHECK_BUTTON)).toBeEnabled()
  }
}
