import type { Decorator } from '@storybook/react-vite'
import { NotificationArea } from '../features/notifications/NotificationArea'

/**
 * The app shell renders the notification area, so stories of a component that raises
 * notifications render it next to the component, to show them pop up.
 */
export const withNotificationArea: Decorator = Story => (
  <>
    <Story />
    <NotificationArea />
  </>
)
