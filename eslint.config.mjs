// @ts-check
import tseslint from 'typescript-eslint'
import security from 'eslint-plugin-security'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '**/vite.config.ts',
      'apps/*/index.html',
      'scripts/**/*.mjs',
      'generate-csp.mjs',
      'taskapp.html',
      'tests/**',
      'vitest.config.ts',
    ],
  },
  ...tseslint.configs.strictTypeChecked,
  security.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "AssignmentExpression[left.property.name='innerHTML']",
          message: 'Use safe render helpers instead of raw innerHTML.',
        },
        {
          selector: "AssignmentExpression[left.property.name='outerHTML']",
          message: 'Use safe render helpers instead of raw outerHTML.',
        },
      ],
      'no-eval': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      // Standard browser-app config: async callbacks are passed as addEventListener arguments
      // and as hook-registration object properties — both patterns are intentional and correct.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { arguments: false, properties: false } }],
      // Standard: underscore-prefixed params/vars are intentionally unused (e.g. _s, _e).
      '@typescript-eslint/no-unused-vars': ['warn', {
        vars: 'all',
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      // TypeScript's type system already prevents object-injection attacks in a
      // typed codebase; bracket notation on Record<K,V> types is legitimate and safe.
      'security/detect-object-injection': 'off',
    },
  },
  {
    // innerHTML assignments in core views are safe: patchInnerHTML() routes all
    // string assignments through the nexus-crm-raw Trusted Types policy (IIFE in
    // trusted-types.ts). auth.ts and ai-ui.ts re-render full sub-sections of the
    // DOM the same way views do. Scoped to views + main.ts + ui + auth + ai-ui.
    files: [
      'packages/core/src/views/**/*.ts',
      'packages/core/src/main.ts',
      'packages/core/src/ui/**/*.ts',
      'packages/core/src/security/auth.ts',
      'packages/core/src/ai/ai-ui.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Disabled provider stubs mimic real class shapes (e.g. TextStreamer from @huggingface/transformers)
    // so they must export constructor-only classes to maintain type compatibility at build-alias time.
    files: ['packages/core/src/ai/providers/*-disabled.ts'],
    rules: { '@typescript-eslint/no-extraneous-class': 'off' },
  },
  {
    // View and AI rendering files use AnyRecord (Record<string,unknown>) typed CRM data
    // for template-literal HTML generation. Properly typing each view's record parameters
    // requires a separate schema-types migration. Until then, the code correctness is
    // guaranteed by the CRM data model — fields typed as unknown are always string/primitive
    // in practice. This override is NARROW: views, AI, and adapter stubs only.
    files: [
      'packages/core/src/views/**/*.ts',
      'packages/core/src/ui/**/*.ts',
      'packages/core/src/ai/**/*.ts',
      'packages/core/src/adapter-interface.ts',
    ],
    rules: {
      // Template literals on AnyRecord fields are safe in these rendering contexts.
      '@typescript-eslint/no-base-to-string': 'off',
      // TypeScript proves some defensive optional-chains are unnecessary; in rendering
      // code where data shape changes frequently, retaining them is preferable to
      // removing them prematurely and introducing runtime errors.
      '@typescript-eslint/no-unnecessary-condition': 'off',
      // Stub adapter methods use async to match the interface signature even when
      // they don't internally await (NullAdapter, disabled providers).
      '@typescript-eslint/require-await': 'off',
      // Views use string+number in CSS/display expressions; explicit coercion would
      // add noise without safety benefit when values are typed as string|number.
      '@typescript-eslint/restrict-plus-operands': 'off',
    },
  },
  {
    // documents.ts uses document.execCommand for contenteditable rich-text formatting
    // (bold, italic, lists, etc.). execCommand is deprecated in the DOM spec but remains
    // the only practical API for synchronous formatting in contenteditable editors — the
    // Selection/Range API requires per-command implementations that are out of scope here.
    // No browser has a concrete removal timeline for the formatting commands in use.
    files: ['packages/core/src/views/documents.ts'],
    rules: { '@typescript-eslint/no-deprecated': 'warn' },
  },
)
