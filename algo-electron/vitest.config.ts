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
        // 跑的就是它，但那条链路在 Vitest 之外，覆盖率收不到。
        //
        // 这里原先还写着"在 Vitest 里 import 它只会走一遍 app.whenReady，涨的是
        // 数字不是信心"——后半句已被推翻：`tests/electron/mainStartupContract.test.ts`
        // 正是在替身下 import 它（whenReady 挂住不 resolve），把单实例闸门验成了行为，
        // 变异检查确认有效（闸门条件改成恒真时它红，而 25 条源码断言全绿）。
        // 仍然排除，是因为那条 import 只跑到 whenReady 之前，把它计入覆盖率会让
        // 闸门之后的大段启动链显得"被覆盖"——排除的理由是数字会骗人，不是测不出信息。
        'electron/main.ts',
        // src/main.tsx：createRoot 挂载，17 行。渲染树本身由 tests/components 覆盖。
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
      // Kept ~2 points under the measured numbers (67.37/62.79/64.90/70.27) so
      // ordinary refactors do not trip the gate, while a real coverage drop
      // still fails. Raise these together with coverage, never lower them.
      //
      // 档位沿革：56/53/54/59（实测 59.52/56.41/57.67/62.07）→ 61/57/58/64
      // （实测 64.47/60.09/61.66/67.20）→ 现在这档。每次都是补完测试就把门跟上，
      // 因为留着空隙会让"覆盖率掉了"变成看不见的事，和棘轮预算高于实际同类。
      //
      // 留 2 点而不是更多：这个数字是**下界**——9 个真实 Electron 套件不在
      // Vitest 里（见上面 exclude 的说明与 QUALITY_HARDENING_PLAN.md §10.1），
      // 所以余量只需吸收重构噪声，不需要替那部分留位置。
      thresholds: {
        statements: 65,
        branches: 60,
        functions: 62,
        lines: 68,
      },
    },
  },
})
