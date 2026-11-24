import { Button } from '../../../components/Button/Button'
import { useSettingsStore } from '../../settings/settingsStore'
import { useUpdateStore } from '../updateStore'

const AUTOMATIC_CHECKS_REASON = 'Disabled while automatic update checks are on'

/**
 * Looks for a newer release when clicked, beside the switch of automatic update checks in the
 * Settings view. It's disabled while those checks are on, since the app then checks each time it
 * opens, and says why in a tooltip while the pointer is over it. While a check runs, from the
 * button or from the app's launch, it reads "Checking for updates…" and can't be clicked. A check
 * that finds nothing says so in a notification, and one that fails notifies why.
 *
 * @summary Button checking for a newer release by hand
 */
export const CheckForUpdatesButton = () => {
  const checksForUpdates = useSettingsStore(state => state.settings.checksForUpdates)
  const isChecking = useUpdateStore(state => state.isChecking)
  const checkByHand = useUpdateStore(state => state.checkByHand)

  return (
    <Button
      variant="outlined"
      isDisabled={checksForUpdates || isChecking}
      disabledReason={checksForUpdates ? AUTOMATIC_CHECKS_REASON : undefined}
      onClick={() => void checkByHand()}
    >
      {isChecking ? 'Checking for updates…' : 'Check for updates'}
    </Button>
  )
}
