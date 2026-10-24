import type { Theme } from './types'

const root = document.documentElement

export const applyTheme = (theme: Theme) => {
  root.dataset.theme = theme
}

export const readAppliedTheme = (): Theme => (root.dataset.theme === 'dark' ? 'dark' : 'light')
