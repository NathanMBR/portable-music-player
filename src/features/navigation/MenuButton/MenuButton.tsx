import { Bars3Icon } from '@heroicons/react/20/solid'
import { IconButton } from '../../../components/IconButton/IconButton'
import { NotificationDot } from '../../../components/NotificationDot/NotificationDot'
import { useUpdateStore } from '../../updates/updateStore'
import { useNavigationStore } from '../navigationStore'

/**
 * Opens the side menu. The app shell gives it a column of its own, so views never include it and
 * nothing sits under it. While an update is offered, a dot on its corner says the menu holds it.
 *
 * @summary Button that opens the side menu
 */
export const MenuButton = () => {
  const openMenu = useNavigationStore(state => state.openMenu)
  const hasUpdate = useUpdateStore(state => state.foundUpdate !== null)

  return (
    <span className="relative inline-flex">
      <IconButton
        icon={Bars3Icon}
        label="Open menu"
        shape="square"
        variant="outlined"
        onClick={openMenu}
      />
      {hasUpdate && <NotificationDot />}
    </span>
  )
}
