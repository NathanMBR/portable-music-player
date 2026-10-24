import { Field, Label, Switch } from '@headlessui/react'
import { useSettingsStore } from './settingsStore'

export const ThemeToggle = () => {
  const theme = useSettingsStore(state => state.theme)
  const settingsError = useSettingsStore(state => state.settingsError)
  const setTheme = useSettingsStore(state => state.setTheme)

  return (
    <div>
      <Field className="flex items-center justify-between gap-4">
        <Label className="text-sm font-medium text-ink">Dark theme</Label>
        <Switch
          checked={theme === 'dark'}
          onChange={isDark => setTheme(isDark ? 'dark' : 'light')}
          className="group inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-ink-faded/50 transition data-checked:bg-pen data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-pen"
        >
          <span className="size-4 translate-x-1 rounded-full bg-paper transition group-data-checked:translate-x-6 motion-reduce:transition-none" />
        </Switch>
      </Field>
      {settingsError && (
        <p role="alert" className="mt-2 text-sm text-correction">
          {settingsError}
        </p>
      )}
    </div>
  )
}
