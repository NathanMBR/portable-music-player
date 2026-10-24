import { Bars3Icon } from '@heroicons/react/20/solid'
import { IconButton } from '../../components/IconButton'
import { useNavigationStore } from './navigationStore'

export const MenuButton = () => {
  const openMenu = useNavigationStore(state => state.openMenu)

  return <IconButton icon={Bars3Icon} label="Open menu" shape="square" onClick={openMenu} />
}
