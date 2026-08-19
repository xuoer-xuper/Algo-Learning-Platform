import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Electron-bound modules are exercised with the deterministic test double
    // in Vitest; real Electron ABI checks remain in tests/verify.mjs.
    alias: {
      electron: fileURLToPath(new URL('./tests/electron/electronMock.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: [
      'tests/ai/traceability.test.ts',
      'tests/coach/llmConfigStore.test.ts',
      'tests/db/backupImport.test.ts',
      'tests/db/dailyStatsPerformance.test.ts',
      'tests/db/migrationSafety.test.ts',
      'tests/db/repositories.test.ts',
      'tests/electron/startupSmoke.test.ts',
    ],
    environment: 'node',
    pool: 'forks',
    isolate: true,
    fileParallelism: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'tmp/coverage',
      reporter: ['text', 'json-summary', 'html'],
      include: ['electron/**/*.ts', 'src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'tests/**',
        'electron/main.ts',
        'electron/preload.ts',
        'electron/browser/ojPreload.ts',
        'electron/scripts/userscriptBootstrapPreload.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
      thresholds: {
        statements: 28,
        branches: 34,
        functions: 24,
        lines: 29,
      },
    },
  },
})
