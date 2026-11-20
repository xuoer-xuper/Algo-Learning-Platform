# 原生 pnpm 发行执行器独立复核

日期：2026-11-17（Asia/Shanghai）。分支 `codex/release-pnpm-runtime`，基于 dev `94bb9b7`。
只审核 `scripts/release-cli.mjs` 的最小执行器修复、定向测试和同步规范；未运行完整门、构建、
安装器或 Git 写操作，未访问用户 profile。

## Findings (fixed)

实现者纠正旧执行器把 pnpm CLI 必然视为 `.js/.cjs` 的假设。独立复核无新增局部修复。
实际 Node22.23.2 / pnpm12.8.1 的 `npm_execpath` 指向 pnpm 包内原生 `pnpm.exe`，旧代码在
`release:build` 调用 test:all 前拒绝它。c520544 的失败日志及 identity 已保存在
`tmp/release-acceptance-c520544-blocked-pnpm/`，没有成功 build.json，不能据此声称全门通过。

## Findings (not fixed)

限定范围无遗留问题。

- 路径必须存在、绝对、指向文件，basename 必须为 pnpm.js/cjs/mjs 或 Windows pnpm.exe。
  不接受任意文件名、相对路径、目录、npm.cjs、伪后缀、cmd/bat 或 missing；错误仍停止。
- JavaScript CLI 用当前 `process.execPath`，原生 exe 直接 spawnSync；参数数组保持独立，
  不新增 shell、不拼接命令、不调用 PATH 上另一个 pnpm、不篡改继承的 npm_execpath。
- 原 cwd、env 合并、隐藏窗口、日志独占写入、缓冲上限和非零退出拒绝保持。
  Git hooks、源码身份、CI、资产和发布授权门没有放宽。
- 新增三类脚本真实子进程探针验证含空格路径/参数、空参数、cwd、环境值及日志；九类拒绝
  检查验证先拒绝而不是执行文件；Windows 测试直接执行继承的真实 pnpm --version。
- 原生测试在无 Windows/native pnpm 的环境会显式 skip；本次独立运行 97 项全部通过，
  没有 skip。另以 `pnpm exec node` 继承真实环境调用 commandRunner，返回 12.8.1。
- 相对维护者测试 d8b5620，electron/src/build/public、package、lockfile、Vite/builder 配置
  及工作流无变更；这是发行工具修复，不替代新 master 的正式构建、安装和资产门。

## Verification

独立 Node22.23.2 / pnpm12.8.1 结果：

- `pnpm run test:release`：97/97 通过（包括真实原生 pnpm，无 skip）。
- scoped ESLint：通过。
- `pnpm run typecheck`、`typecheck:tests`：通过。
- scoped Prettier、docs、diff：通过。
- 无环境覆盖的真实 commandRunner → pnpm.exe --version：12.8.1，通过。

本报告仅支持正常提交/推送和重新集成，不是 c520544 或未来 master 的通过证据。
