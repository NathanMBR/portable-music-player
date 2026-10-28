import { Button } from '@headlessui/react'
import { CATEGORIES } from './categories'
import { useNavigationStore } from './navigationStore'

const CURRENT_CATEGORY_CLASSES = 'bg-pen/10 font-semibold text-pen'
const OTHER_CATEGORY_CLASSES = 'text-ink data-hover:bg-rule/60'

/**
 * The side menu's categories. The current one is highlighted and marked as the current page.
 * Choosing one switches the view and closes the menu.
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
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-base data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-pen ${isCurrent ? CURRENT_CATEGORY_CLASSES : OTHER_CATEGORY_CLASSES}`}
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
