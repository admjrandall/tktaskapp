import type { StorybookConfig } from '@storybook/html-vite'

const config: StorybookConfig = {
  framework: '@storybook/html-vite',
  stories: [
    '../packages/core/src/ui/primitives/**/*.stories.ts',
    '../packages/core/src/views/**/*.stories.ts',
  ],
  addons: [],
  docs: {
    autodocs: 'tag',
  },
}

export default config
