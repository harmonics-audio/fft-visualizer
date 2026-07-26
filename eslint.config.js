import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

export default ts.config(
  {
    ignores: [
      '**/dist/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/wasm/pkg/**',
      '**/wasm/target/**',
      'backend-examples/**',
      '**/node_modules/**'
    ]
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.{ts,tsx,vue}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        // Let the Vue parser hand <script lang="ts"> off to the TS parser
        parser: ts.parser
      }
    },
    rules: {
      // typescript-eslint turns no-undef off for .ts but not for .vue, where it
      // then misreads ambient globals — Nuxt's auto-imported composables have no
      // import statement to see. TypeScript already reports genuine unknowns.
      'no-undef': 'off',
      // The codebase uses non-null assertions on typed-array indexing deliberately
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
)
