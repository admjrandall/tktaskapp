import { defineOfflineProfileConfig } from './vite.profile.config.js'

export default defineOfflineProfileConfig({
  entry: 'entry-no-ai.ts',
  html: 'index.no-ai.html',
  outDir: '../../dist/offline-no-ai',
  disableAllAi: true,
  disableBrowserAi: true,
  disableTransformers: true,
  disableOllama: true,
  disableCloudAi: true,
})
