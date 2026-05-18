/// <reference types="node" />
import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  root: __dirname,
  build: {
    target: 'esnext',
    outDir: '../../dist/dataverse',
    emptyOutDir: true,
  },
  define: {
    __OT_ONLY_BUILD__: 'false',
  },
  resolve: {
    alias: {
      '@core':               resolve(__dirname, '../../packages/core/src'),
      '@adapter-dataverse':  resolve(__dirname, '../../packages/adapter-dataverse/src'),
    },
  },
});
