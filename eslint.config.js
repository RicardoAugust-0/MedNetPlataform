import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // dist: build output | supabase/functions: Deno runtime (lintado à parte)
  // google-apps-script.js: roda no Google Apps Script (globais próprias)
  globalIgnores(['dist', 'supabase/functions', 'google-apps-script.js']),

  // Frontend (browser + JSX)
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  // Bot RPA e scripts auxiliares (Node)
  {
    files: ['vps/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
])
