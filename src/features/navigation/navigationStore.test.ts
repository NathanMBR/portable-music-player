import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORY } from './categories'
import { useNavigationStore } from './navigationStore'

describe('navigationStore', () => {
  it('starts on the default category with the menu closed', () => {
    expect(useNavigationStore.getState()).toMatchObject({
      currentCategory: DEFAULT_CATEGORY,
      isMenuOpen: false
    })
  })

  it('opens and closes the menu', () => {
    useNavigationStore.getState().openMenu()
    expect(useNavigationStore.getState().isMenuOpen).toBe(true)

    useNavigationStore.getState().closeMenu()
    expect(useNavigationStore.getState().isMenuOpen).toBe(false)
  })

  it('closes the menu when a category is chosen', () => {
    useNavigationStore.getState().openMenu()

    useNavigationStore.getState().selectCategory('songs')

    expect(useNavigationStore.getState()).toMatchObject({
      currentCategory: 'songs',
      isMenuOpen: false
    })
  })
})
