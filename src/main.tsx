import '@fontsource-variable/archivo/wdth.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { useLibraryStore } from './features/library/libraryStore'
import './index.css'

// Runs once per launch; a mount effect would scan twice in development under StrictMode.
void useLibraryStore.getState().scanLibrary()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
