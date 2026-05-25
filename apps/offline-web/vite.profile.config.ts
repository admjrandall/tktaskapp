/// <reference types="node" />
import { defineConfig } from 'vite'
import type { Alias, UserConfig } from 'vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { readFileSync } from 'fs'
import { baseConfig } from '../../config/vite/base.config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '../../')

const rootPkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf-8')) as {
  version: string
}

type OfflineProfileConfig = {
  entry: 'entry-browser-ai.ts' | 'entry-no-ai.ts' | 'entry-internal-ai.ts'
  html?: string
  outDir: string
  otAIConnectSrc?: string | undefined
  disableBrowserAi?: boolean
  disableOllama?: boolean
  disableCloudAi?: boolean
  disableTransformers?: boolean
  disableAllAi?: boolean
}

function _providerAlias(find: string, replacement: string): Alias {
  return { find, replacement: resolve(repoRoot, replacement) }
}

export function defineOfflineProfileConfig(profile: OfflineProfileConfig): UserConfig {
  const base = baseConfig()
  const otAIConnectSrc = (profile.otAIConnectSrc ?? '').trim()
  const aliases: Alias[] = [...((base.resolve?.alias ?? []) as Alias[])]

  if (profile.disableAllAi) {
    aliases.push(
      _providerAlias('./deployment-policy.js', 'packages/core/src/deployment-policy-no-ai.ts'),
      _providerAlias('../deployment-policy.js', 'packages/core/src/deployment-policy-no-ai.ts'),
      _providerAlias('@core/deployment-policy.js', 'packages/core/src/deployment-policy-no-ai.ts'),
      _providerAlias('./hooks-wiring.js', 'packages/core/src/hooks-wiring-no-ai.ts'),
      _providerAlias('./views/settings.js', 'packages/core/src/views/settings-no-ai.ts'),
      _providerAlias('./ai/ai-runtime.js', 'packages/core/src/ai/no-ai-runtime.ts'),
      _providerAlias('./ai/ai-ui.js', 'packages/core/src/ai/no-ai-ui.ts'),
      _providerAlias('./ai/ai-settings.js', 'packages/core/src/ai/no-ai-settings.ts'),
      _providerAlias('./ai/ai-prefs.js', 'packages/core/src/ai/no-ai-prefs.ts'),
    )
  }

  if (profile.disableTransformers) {
    aliases.push(
      _providerAlias(
        '@huggingface/transformers',
        'packages/core/src/ai/providers/browser-transformers-disabled.ts',
      ),
      _providerAlias(
        './providers/browser-transformers.js',
        'packages/core/src/ai/providers/browser-ai-disabled.ts',
      ),
    )
  }
  if (profile.disableBrowserAi) {
    aliases.push(
      _providerAlias(
        './providers/browser-nano.js',
        'packages/core/src/ai/providers/browser-ai-disabled.ts',
      ),
      _providerAlias(
        './providers/browser-transformers.js',
        'packages/core/src/ai/providers/browser-ai-disabled.ts',
      ),
    )
  }
  if (profile.disableOllama) {
    aliases.push(
      _providerAlias('./providers/ollama.js', 'packages/core/src/ai/providers/ollama-disabled.ts'),
    )
  }
  if (profile.disableCloudAi) {
    aliases.push(
      _providerAlias(
        './providers/anthropic.js',
        'packages/core/src/ai/providers/cloud-disabled.ts',
      ),
      _providerAlias('./providers/openai.js', 'packages/core/src/ai/providers/cloud-disabled.ts'),
      _providerAlias('./providers/google.js', 'packages/core/src/ai/providers/cloud-disabled.ts'),
    )
  }

  return defineConfig({
    root: __dirname,
    plugins: [
      {
        name: 'taskapp-build-vars',
        transformIndexHtml(html) {
          return html
            .replace(/(\.?\/?src\/)entry-browser-ai\.ts/g, `$1${profile.entry}`)
            .replace('{{OT_AI_CONNECT_SRC}}', otAIConnectSrc)
            .replace('{{APP_VERSION}}', rootPkg.version)
        },
      },
      {
        name: 'taskapp-offline-html-output-name',
        generateBundle(_options, bundle) {
          for (const output of Object.values(bundle)) {
            if (output.type === 'asset' && output.fileName.endsWith('.html')) {
              output.fileName = 'index.html'
            }
          }
        },
      },
      ...(base.plugins ?? []),
    ],
    define: {
      __OT_AI_CONNECT_SRC__: JSON.stringify(otAIConnectSrc),
      __OT_ONLY_BUILD__: 'true',
      __APP_VERSION__: JSON.stringify(rootPkg.version),
    },
    build: {
      ...base.build,
      outDir: profile.outDir,
      emptyOutDir: true,
      rolldownOptions: {
        ...(base.build?.rolldownOptions ?? {}),
        input: { index: resolve(__dirname, profile.html ?? 'index.html') },
      },
    },
    resolve: {
      alias: aliases,
    },
  })
}
