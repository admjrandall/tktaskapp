import type { Preview } from '@storybook/html'

// Inject the app's compiled CSS bundle so stories render with full styles.
// Update the path if the offline build output location changes.
// For dev, run `pnpm build:offline` once to generate the stylesheet.
// import '../dist/offline/index.html'  // uncomment when needed

const preview: Preview = {
  parameters: {
    layout: 'padded',
    backgrounds: {
      default: 'surface',
      values: [
        { name: 'surface', value: '#0f0f12' }, // --bg-surface (dark default)
        { name: 'light', value: '#ffffff' },
      ],
    },
  },
}

export default preview
