import { clearMocks } from '@tauri-apps/api/mocks'
import { afterEach, beforeEach } from 'vitest'
import { mockCommands } from './mockCommands'
import { resetStores } from './resetStores'

// Like the stories: tests mock the commands they trigger, and any other command fails loudly.
beforeEach(() => {
  mockCommands({})
})

afterEach(() => {
  clearMocks()
  resetStores()
})
