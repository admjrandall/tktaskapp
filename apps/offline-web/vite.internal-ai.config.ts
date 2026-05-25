import { defineOfflineProfileConfig } from './vite.profile.config.js'

export default defineOfflineProfileConfig({
  entry: 'entry-internal-ai.ts',
  html: 'index.internal-ai.html',
  outDir: '../../dist/offline-internal-ai',
  otAIConnectSrc: process.env.OT_AI_CONNECT_SRC,
  disableTransformers: true,
  disableCloudAi: true,
})
