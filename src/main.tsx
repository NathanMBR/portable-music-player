import '@fontsource-variable/archivo/wdth.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { useLibraryStore } from './features/library/libraryStore'
import { connectButtonLog } from './features/logging/buttonLog'
import { connectMediaSession } from './features/playback/mediaSession'
import { connectPlaybackMemory, restorePlayback } from './features/playback/playbackMemory'
import { connectSongAudio } from './features/playback/songAudio'
import { connectWindowTitle } from './features/playback/windowTitle'
import { useSettingsStore } from './features/settings/settingsStore'
import './index.css'

// Runs once per launch; a mount effect would run twice in development under StrictMode.
const settingsLoaded = useSettingsStore.getState().restoreSettings()
const libraryScanned = useLibraryStore.getState().scanLibrary()
connectSongAudio(new Audio())
connectWindowTitle()
connectMediaSession()
connectButtonLog()
// The player's song is found among the scanned ones, and the player is saved only once it's back.
void Promise.all([settingsLoaded, libraryScanned]).then(() => {
  restorePlayback()
  connectPlaybackMemory()
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
