# R4 数据刷新：实施与验收（2026-11-04）

## 范围

在 `refactor/phase-2-ipc-contract` 实施阶段 2 R4；起点 `c0c6cc3` 已推送且 CI
`41829793654` 全绿。未修改时间戳、迁移、用户真实数据库或 `.zcode/`；R5 保持安全门待处理。

## 实施内容

- `data:changed` 新通道和 shared zod payload：八个逻辑域，只携带域名称。
- 同步事务通知 scope 覆盖五处目标事务调用；真实提交后发布，嵌套回滚丢弃对应变化，
  非事务 batch 部分提交不丢事件。bridge 固定 50ms 合并去重，退出/冒烟清理幂等。
- problem/submission/visits/stats、notes、sites、credentials、account/rating、Coach、
  scripts/runtime、backup import、启动时 orphan visit recovery 写路径接入。
  Cookie metadata 查询写入不接入，避免无限刷新循环。
- preload `api.data.onChanged`；`DataRefreshProvider`、`useIpcQuery`、
  `useIpcSubscription`；17 个取数组件迁移，四处 App snapshot/live 样板收敛。
- 后台刷新保留数据与编辑草稿，旧请求不覆盖新查询身份，初始读取与 refetch 状态分离。
  `problems:updated` 保留原字符串与无 payload 语义一版；唯一旧 API 兼容豁免有显式守卫。
- 新真实同步 Playwright 使用独立临时 SQLite、真实 SyncService/default batch writer、
  guarded IPC、preload、事件桥与 React 页面；测试专用 Codeforces 固定响应，禁止外部网络。
  验证 Dashboard 总题数 1→2、题目详情 0→1 次 AC，两秒共同预算内更新且 DOM 未重挂载。

## 复核修复

1. 手动 refetch 被同 key 后台请求抢先后仍应返回自身成功值供导入选中使用，但不能覆盖新状态；
   key 改变/卸载/禁用则不返回旧值。
2. 多 Codeforces 账户下不能刷新回任意首个账户；按已选择 handle 查询并保留独立输入草稿。
3. 时间轴背景请求失败保留已加载内容并显示错误；初次失败仍展示错误页。
4. 远程脚本来源/取消不等待完整预览；过期预览重新验证失败时隐藏旧安装动作，不能将
   query 吞掉的失败当成“已刷新”。
5. App null capture 事件清理错误；无关 captureId 的结果不推进提示 revision，否则会吞掉
   在途初始快照。匹配结果、显式 dismiss 与卸载仍保持原行为。
6. 无骨架测试按实际 `role=status`/隐藏文本断言，并验证初载确实存在骨架，避免假阴性。
7. 加入真实 SQLite deferred-COMMIT 失败、内层 SAVEPOINT 回滚被捕获后外层提交、实际默认
   BatchWriter 部分失败及导入回滚测试，不只用假的事务 callback 验证通知机制。

## 最终验证

功能提交 `a12c09b` 已推送；推送钩子的 `pnpm test:ci` 通过，远端 CI
`41837918446`（对应同一 SHA）的 fast-guard 和 Electron/renderer smoke 均成功。
PR #6 已更新，未合并。R1-R3 修复提交 `c0c6cc3` 的 CI `41829793654` 也通过。

| 检查 | 结果 |
| --- | --- |
| `pnpm test:all` | 退出 0；184 文件 / 1493 用例；真实 Electron/DB/AI/Coach 套件通过 |
| Playwright | 10/10，含真实同步两秒刷新验收 |
| 应用 + 测试 typecheck、lint | 通过 |
| 架构守卫 | 21/21 |
| jscpd | 1.69%，低于 3% |
| `pnpm build:check` | renderer/main/preload 构建及 packaged-main 检查通过 |
| docs、`git diff --check` | 通过 |

覆盖率：statements 73.79%、branches 67.66%、functions 70.99%、lines 77.00%。
最终日志在忽略目录 `algo-electron/tmp/`：`r4-all-verified.log`、`r4-build-verified.log`、
`r4-duplication-final.log`。此前 `r4-all-release-gate.log` 因最后新增 fixture 缺少
`displayName` 未通过测试 typecheck，该错误已修复后完整重跑，不作为通过证据。

三位实施 worker 和独立 checker 已完成，最终无待修复 R4 findings。保留既有 React
`flushSync`、Electron 旧 console-message 签名及 Vite 大 chunk 警告，不屏蔽或扩大本节范围。

## 未完成事项

R5 未开始；`research/r5-feasibility.md` 记录真实旧库副本不足、混合 local/UTC+8 语义、
NOT NULL 非法值策略、外键重建及统计重算初始化依赖。不能按原设计直接实施 030，也不能
用生成数据冒充三时期真实库。先补充真实副本/确认验收输入及修订数据迁移策略，再独立分支。

当前任务不归档、不标记完成；R1-R4 可单独交付 PR #6，R5 仍需独立验收。
