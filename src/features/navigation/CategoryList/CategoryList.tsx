import { CATEGORIES } from '../categories'
import { MenuOption } from '../MenuOption/MenuOption'
import { useNavigationStore } from '../navigationStore'

/**
 * The side menu's categories. The current one takes the active look of pressed buttons and is
 * marked as the current page. Choosing one switches the view and closes the menu.
 *
 * @summary Category navigation of the side menu
 */
export const CategoryList = () => {
  const currentCategory = useNavigationStore(state => state.currentCategory)
  const selectCategory = useNavigationStore(state => state.selectCategory)

  return (
    <nav aria-label="Categories">
      <ul className="space-y-1">
        {CATEGORIES.map(({ id, label, icon }) => (
          <li key={id}>
            <MenuOption
              icon={icon}
              label={label}
              isCurrent={id === currentCategory}
              onClick={() => selectCategory(id)}
            />
          </li>
        ))}
      </ul>
    </nav>
  )
}
