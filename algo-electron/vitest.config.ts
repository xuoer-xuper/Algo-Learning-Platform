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
    // Suites that need real Electron, safeStorage or the better-sqlite3 ABI.
    // They are driven by tests/verify.mjs and must not run under the Vitest
    // Electron double, where they fail on their missing bundle env vars.
    exclude: [
      'tests/ai/traceability.test.ts',
      'tests/coach/llmConfigStore.test.ts',
      'tests/db/backupImport.test.ts',
      'tests/db/dailyStatsPerformance.test.ts',
      'tests/db/migrationSafety.test.ts',
      'tests/db/repositories.test.ts',
      'tests/electron/ojSubmissionBridgeSmoke.test.ts',
      'tests/electron/startupSmoke.test.ts',
      'tests/electron/userScriptRuntimeSmoke.test.ts',
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
      // Kept a few points under the measured numbers (58.46/55.83/54.88/61.01)
      // so ordinary refactors do not trip the gate, while a real coverage drop
      // still fails. Raise these together with coverage, never lower them.
      thresholds: {
        statements: 55,
        branches: 53,
        functions: 52,
        lines: 58,
      },
    },
  },
})
