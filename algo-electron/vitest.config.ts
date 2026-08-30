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
      // 三个 preload 曾在这里被排除，理由是"preload 在测试环境无法执行"。该论据
      // 不成立：它们是纯副作用模块，import 即执行，唯一的观察点是 contextBridge
      // 收到了什么（electronMock 的 exposedMainWorld 就是为此加的）。现已全部纳入，
      // 由 tests/ipc/preloadSurface、tests/browser/ojPreloadModule、
      // tests/scripts/userscriptBootstrapPreloadModule 覆盖。
      //
      // 剩下三项都是入口装配，不是"没测"而是"测不出信息"：
      exclude: [
        'tests/**',
        // main.ts：进程启动装配。真实 Electron 冒烟（tests/verify.mjs electron）
        // 跑的就是它，但那条链路在 Vitest 之外，覆盖率收不到。改成在 Vitest 里
        // import 它只会在替身上把 app.whenReady 走一遍，涨的是数字不是信心。
        'electron/main.ts',
        // src/main.tsx：createRoot 挂载，17 行。渲染树本身由 tests/components 覆盖。
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
      // Kept a few points under the measured numbers (59.52/56.41/57.67/62.07)
      // so ordinary refactors do not trip the gate, while a real coverage drop
      // still fails. Raise these together with coverage, never lower them.
      thresholds: {
        statements: 56,
        branches: 53,
        functions: 54,
        lines: 59,
      },
    },
  },
})
