import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-vitest',
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
    '@storybook/addon-mcp',
    '@storybook/addon-themes'
  ],
  framework: '@storybook/react-vite',
  // Feeds the MCP server's docs tools, so agents can read the components' docs. Docgen stays on
  // the default react-docgen: react-docgen-typescript leaves the components' JSDoc @summary out
  // of this manifest.
  features: {
    componentsManifest: true
  },
  core: {
    disableTelemetry: true
  }
}
export default config
