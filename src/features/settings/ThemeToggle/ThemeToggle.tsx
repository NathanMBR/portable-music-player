import { MoonIcon, SunIcon } from '@heroicons/react/16/solid'
import { Switch } from '../../../components/Switch/Switch'
import { useSettingsStore } from '../settingsStore'

const TOGGLE_LABEL = 'Dark theme'

/**
 * Switch between the light and dark themes. The choice applies at once and is saved in
 * settings.json next to the executable. If saving fails, the theme still changes and a
 * notification says why.
 *
 * @summary Light and dark theme switch
 */
export const ThemeToggle = () => {
  const theme = useSettingsStore(state => state.theme)
  const setTheme = useSettingsStore(state => state.setTheme)
  const isDark = theme === 'dark'
  const KnobIcon = isDark ? MoonIcon : SunIcon

  return (
    <div className="flex justify-center">
      <Switch
        label={TOGGLE_LABEL}
        checked={isDark}
        onChange={checked => setTheme(checked ? 'dark' : 'light')}
        knobIcon={KnobIcon}
      />
    </div>
  )
}
