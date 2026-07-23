import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

export default ts.config(
  {
    ignores: [
      '**/dist/**',
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
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        // Let the Vue parser hand <script lang="ts"> off to the TS parser
        parser: ts.parser
      }
    },
    rules: {
      // The codebase uses non-null assertions on typed-array indexing deliberately
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
)
