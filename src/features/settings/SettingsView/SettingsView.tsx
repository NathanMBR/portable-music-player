import { Select } from '../../../components/Select/Select'
import { Switch } from '../../../components/Switch/Switch'
import { ViewHeader } from '../../../components/ViewHeader/ViewHeader'
import { ViewLayout } from '../../../components/ViewLayout/ViewLayout'
import { SETTINGS_ICON, SETTINGS_TITLE } from '../constants'
import { SettingCard } from '../SettingCard/SettingCard'
import { useSettingsStore } from '../settingsStore'
import type { SongOrder } from '../types'

const SONG_ORDER_OPTIONS: readonly { value: SongOrder; label: string }[] = [
  { value: 'fileName', label: 'Filename' },
  { value: 'title', label: 'Title (if existing)' }
]

// Only the choice exists so far: nothing searches for updates yet.
const UpdateSearchSetting = () => {
  const checksForUpdates = useSettingsStore(state => state.settings.checksForUpdates)
  const setChecksForUpdates = useSettingsStore(state => state.setChecksForUpdates)

  return (
    <SettingCard label="Search automatically for updates">
      <Switch checked={checksForUpdates} onChange={setChecksForUpdates} />
    </SettingCard>
  )
}

const SongOrderSetting = () => {
  const songOrder = useSettingsStore(state => state.settings.songOrder)
  const setSongOrder = useSettingsStore(state => state.setSongOrder)

  return (
    <SettingCard label="Sort songs by">
      <Select options={SONG_ORDER_OPTIONS} value={songOrder} onChange={setSongOrder} />
    </SettingCard>
  )
}

/**
 * The Settings category: whether the player searches for updates on its own (on by default; the
 * search itself isn't built yet), and whether the songs list sorts by filename or by title, which
 * is the title tag or, for a song without one, its filename. Each option is a `SettingCard`, its
 * label at the left and its control at the right, spanning the width between the side margins.
 * Each choice applies at once and is saved in settings.json next to the executable; if saving
 * fails, the choice still applies and a notification says why.
 *
 * @summary Settings category view
 */
export const SettingsView = () => (
  <ViewLayout header={<ViewHeader icon={SETTINGS_ICON} title={SETTINGS_TITLE} />}>
    <div className="space-y-3 py-6">
      <UpdateSearchSetting />
      <SongOrderSetting />
    </div>
  </ViewLayout>
)
