import { clearMocks } from '@tauri-apps/api/mocks'
import { afterEach } from 'vitest'
import { resetStores } from './resetStores'

afterEach(() => {
  clearMocks()
  resetStores()
})
