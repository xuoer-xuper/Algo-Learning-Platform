import babelParser from '@babel/eslint-parser'
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default [
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'release/**',
      'tmp/**',
      'node_modules/**',
      '*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ['@babel/preset-typescript'],
        },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-undef': 'off',
      'no-unused-vars': 'off',
      // TypeScript 7 is ahead of typescript-eslint's type-aware parser. Keep
      // the runtime-independent async safety checks enabled until that gap is
      // closed and the stricter promise rules can be restored.
      'no-async-promise-executor': 'error',
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ['electron/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    rules: {
      'no-promise-executor-return': 'error',
      'require-atomic-updates': 'error',
    },
  },
  {
    files: ['**/*.tsx'],
    languageOptions: {
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: [['@babel/preset-typescript', { ignoreExtensions: true }]],
          plugins: ['@babel/plugin-syntax-jsx'],
        },
      },
    },
  },
]
