import { Button } from '@headlessui/react'
import { ACTIVE_CLASSES, FOCUS_CLASSES } from '../../../components/buttonStyles'
import { CATEGORIES } from '../categories'
import { useNavigationStore } from '../navigationStore'

const CURRENT_CATEGORY_CLASSES = `${ACTIVE_CLASSES} font-semibold`
// Labels stay in full ink, unlike quiet icons, so the category names read as easily as titles.
const OTHER_CATEGORY_CLASSES = 'text-ink data-hover:bg-rule/60'

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
        {CATEGORIES.map(({ id, label, icon: Icon }) => {
          const isCurrent = id === currentCategory

          return (
            <li key={id}>
              <Button
                aria-current={isCurrent ? 'page' : undefined}
                onClick={() => selectCategory(id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-base ${FOCUS_CLASSES} ${isCurrent ? CURRENT_CATEGORY_CLASSES : OTHER_CATEGORY_CLASSES}`}
              >
                <Icon className="size-5" />
                {label}
              </Button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
