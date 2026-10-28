import { Bars3Icon } from '@heroicons/react/20/solid'
import { IconButton } from '../../components/IconButton'
import { useNavigationStore } from './navigationStore'

/**
 * Opens the side menu. The app shell gives it a column of its own, so views never include it and
 * nothing sits under it.
 *
 * @summary Button that opens the side menu
 */
export const MenuButton = () => {
  const openMenu = useNavigationStore(state => state.openMenu)

  return <IconButton icon={Bars3Icon} label="Open menu" shape="square" onClick={openMenu} />
}
