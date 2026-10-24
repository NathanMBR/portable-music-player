import '@fontsource-variable/archivo/wdth.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { useLibraryStore } from './features/library/libraryStore'
import { useSettingsStore } from './features/settings/settingsStore'
import './index.css'

// Runs once per launch; a mount effect would run twice in development under StrictMode.
void useSettingsStore.getState().restoreSettings()
void useLibraryStore.getState().scanLibrary()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
