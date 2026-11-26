import '@fontsource-variable/archivo/wdth.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { useLibraryStore } from './features/library/libraryStore'
import { connectButtonLog } from './features/logging/buttonLog'
import { connectKeyboardShortcuts } from './features/playback/keyboardShortcuts'
import { connectMediaControls } from './features/playback/mediaControls'
import { connectPlaybackMemory, restorePlayback } from './features/playback/playbackMemory'
import { connectSongEngine } from './features/playback/songEngine'
import { connectWindowTitle } from './features/playback/windowTitle'
import { usePlaylistsStore } from './features/playlists/playlistsStore'
import { useSettingsStore } from './features/settings/settingsStore'
import { connectSongDrop } from './features/songDrop/songDropEvents'
import { useUpdateStore } from './features/updates/updateStore'
import './index.css'

// Runs once per launch; a mount effect would run twice in development under StrictMode.
const settingsLoaded = useSettingsStore.getState().restoreSettings()
const libraryScanned = useLibraryStore.getState().scanLibrary()
// Scans never list them again: whether their songs are there is read from the song list.
const playlistsListed = usePlaylistsStore.getState().loadPlaylists()
connectSongEngine()
connectWindowTitle()
connectMediaControls()
connectKeyboardShortcuts()
connectButtonLog()
connectSongDrop()
// Waits for the settings, which say whether to look for a newer release.
void settingsLoaded.then(() => useUpdateStore.getState().checkAtLaunch())
// The player's song is found among the scanned ones, in its playlist, and the player is saved only
// once it's back.
void Promise.all([settingsLoaded, libraryScanned, playlistsListed]).then(() => {
  restorePlayback()
  connectPlaybackMemory()
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
