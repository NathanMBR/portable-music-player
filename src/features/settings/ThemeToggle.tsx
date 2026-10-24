import { Switch } from '@headlessui/react'
import { MoonIcon, SunIcon } from '@heroicons/react/16/solid'
import { useSettingsStore } from './settingsStore'

const TOGGLE_LABEL = 'Dark theme'

export const ThemeToggle = () => {
  const theme = useSettingsStore(state => state.theme)
  const settingsError = useSettingsStore(state => state.settingsError)
  const setTheme = useSettingsStore(state => state.setTheme)
  const isDark = theme === 'dark'
  const KnobIcon = isDark ? MoonIcon : SunIcon

  return (
    <div className="flex flex-col items-center">
      <Switch
        aria-label={TOGGLE_LABEL}
        title={TOGGLE_LABEL}
        checked={isDark}
        onChange={checked => setTheme(checked ? 'dark' : 'light')}
        className="group inline-flex h-7 w-12 shrink-0 items-center rounded-full bg-ink-faded/50 transition data-checked:bg-pen data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-pen"
      >
        <span className="inline-flex size-6 translate-x-0.5 items-center justify-center rounded-full bg-paper transition group-data-checked:translate-x-5.5 motion-reduce:transition-none">
          <KnobIcon className="size-4 text-pen" />
        </span>
      </Switch>
      {settingsError && (
        <p role="alert" className="mt-2 text-center text-sm text-correction">
          {settingsError}
        </p>
      )}
    </div>
  )
}
