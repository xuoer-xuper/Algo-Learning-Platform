## 变更范围

- 任务编号：
- 变更类型：feat / fix / docs / test / refactor / chore / ci
- 涉及模块：

## 边界确认

- [ ] 不涉及数据库 schema
- [ ] 不涉及 IPC/Preload API
- [ ] 不涉及 Cookie、session 或可复用登录态
- [ ] 不涉及真实 OJ 用户源码、完整请求体或本机数据库内容
- [ ] 不改变 Nowcoder / VJudge 实时入库来源为通用 DOM verdict observer

如有任一项不勾选，请在下方说明影响、文档同步和验证方式。

## 验证

- [ ] `npm run test:core`
- [ ] `npm run test:adapters`（提交监测或 adapter 相关）
- [ ] `npm run test:submissions`（提交写入、watcher、sync 相关）
- [ ] `npm run test:db`（repository 或 migration 相关）
- [ ] `npm run test:electron`（主进程、浏览器容器、IPC 相关）
- [ ] `npm run test:ui`（renderer 布局或关键页面相关）
- [ ] `npm run test:all`（发布前或大范围改动）

## 手测

- [ ] 不需要手测
- [ ] 已按 `docs/final-acceptance-checklist.md` 完成相关手测
- [ ] 需要用户后续手测，范围：

## 文档同步

- [ ] `TASKS.md`
- [ ] `AI_HANDOFF.md`
- [ ] 模块 README / `docs/README.md`
- [ ] 其他：

## 备注

说明风险、临时通过项或后续待办。
