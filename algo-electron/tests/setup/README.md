# tests/setup 说明

## 1. 职责

`tests/setup/` 存放 Vitest 在**每个测试文件之前**执行的全局设置。这里的代码不包含断言，也不替测试声明替身；它只负责把测试环境调到一个统一、可解释的初始状态，避免同类问题在 169 个测试文件里各写一遍。

## 2. 当前内容

- `testing-library-timeout.ts`：把 Testing Library 的 `asyncUtilTimeout`（`findBy*` / `waitFor` 的轮询预算）从默认 1000ms 提到 5000ms，只在 jsdom 环境生效。

  为什么需要：本仓库的测试跑在 "v8 覆盖率插桩 + `pool: forks` + `fileParallelism: true`" 下。同一断言单独执行 345ms 就绪，全量执行要 1157ms，于是默认 1s 预算让 `pnpm test:all` 长期失败在 `tests/coach/coachMouseEventDedupe.test.ts` 的「关闭对话」按钮上。同一失败在换包管理器之前的 npm 依赖图上同样复现（基线 2/2 失败），所以它不是某次依赖变更带来的，而是预算本身低于本仓库的运行环境。

  它不放松任何断言：真实缺陷仍然会在 5s 后变红，只是不再由机器负载决定红的归属。

## 3. 入口

`vitest.config.ts` 的 `test.setupFiles` 是唯一挂载点：`./tests/setup/testing-library-timeout.ts`。新增设置文件时在那里登记，不要在各测试文件里 import。

## 4. 边界与维护规则

- 不在这里写业务替身、fixture 或断言辅助函数：替身放 `tests/electron/electronMock.ts` 一类就近位置，断言属于具体测试文件。
- 不放依赖具体用例状态的钩子（`beforeEach` 里改全局状态）；这里只允许"与用例无关的环境参数"。
- 不放需要 DOM 之外的副作用（写文件、起进程、连数据库），那些属于 `tests/verify.mjs` 编排的套件。
- 提高超时前必须先证明失败与负载相关（单独跑通过、全量跑失败、且基线可复现），不能拿超时掩盖真实缺陷。
- 新增目录必须同时补本 README，否则 `pnpm test:docs` 的 README 覆盖检查会失败。

## 5. 验证入口

```powershell
cd algo-electron
pnpm run test:core
pnpm run test:coverage
```

`test:coverage` 是全量并行下的复核命令：这里的设置若要生效，必须在它下面看到 `tests/coach/coachMouseEventDedupe.test.ts` 与 `tests/components/transition*.tsx` 稳定通过，而不是只在单独运行某个文件时通过。
