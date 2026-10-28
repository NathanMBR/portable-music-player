import '@fontsource-variable/archivo/wdth.css'
import '../src/index.css'
import { withThemeByDataAttribute } from '@storybook/addon-themes'
import type { Preview, ReactRenderer } from '@storybook/react-vite'
import { clearMocks } from '@tauri-apps/api/mocks'
import { mockCommands } from '../src/testing/mockCommands'
import { resetStores } from '../src/testing/resetStores'

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i
      }
    },

    a11y: {
      // Headless UI dialogs, like the side menu, render in a portal on <body>, outside the story
      // root, so the whole body is checked. On the story root alone, an open dialog stalls the check.
      context: 'body',
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'error'
    }
  },
  // The app themes itself through data-theme on <html> (see src/index.css), so the toolbar does too.
  decorators: [
    withThemeByDataAttribute<ReactRenderer>({
      themes: { light: 'light', dark: 'dark' },
      defaultTheme: 'light',
      attributeName: 'data-theme'
    })
  ],
  beforeEach: () => {
    resetStores()
    // There is no Tauri runtime in Storybook: stories mock the commands they trigger, and any other
    // command fails loudly.
    mockCommands({})
    return clearMocks
  }
}

export default preview
