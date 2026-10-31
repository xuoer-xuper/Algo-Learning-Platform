# 修复标签页 favicon——首标签固定地球图标、其余标签图标加载不出

## Goal

标签条每个 web 标签显示所在站点的真实 favicon。当前（截图实证，2026-10-31）：第一个标签无论什么站点都显示固定的地球默认图标，其余标签无论什么站点都只显示空白页占位图标——**没有任何标签能显示真实图标**。

## Root Cause（trellis-research 2026-10-31 实证，file:line 与复现方法见当日会话报告）

两个叠加缺陷，同一 bug 的两种数据状态（不是 index-0 特判）：

1. **主因：壳 CSP 禁远程图片**——`electron/app/appProtocol.ts:14` 的 `img-src 'self' data: blob: note-asset:` 挡掉所有 `https:` favicon（`TabManager.ts:660` 从 `page-favicon-updated` 捕获的站点图标全部是 https URL）。打包态壳页面由 `app://shell` + 此 CSP 提供，**favicon 功能自 CSP 引入（a004d3c，8 月 17 日）起在打包态从未工作过**（dev 态 Vite 无 CSP 所以从未暴露）。研究已在真实 dist 上复现 CSP 违例控制台输出。
2. **次因：onError 首错丢失**——`TabStrip.tsx:86` 的 `onError` 想把坏图标换回地球，但 React 19 对新建 img 的首次 error 事件在监听器挂上前就已发生（src 在元素创建期就开始加载；`key={tab.favicon}` 每次更新都重挂 img，首错同样丢失）→ CSP 拦截的 img 永远停在原地，渲染成空白槽（截图里的"空白页图标"）。

症状映射：`favicon === null` 的标签 → 走 `TabStrip.tsx:90` 的 globe 兜底（"第一个标签固定地球"）；favicon 有值但被 CSP 拦的标签 → img 空槽（"其余标签加载不出"）。

非 B5 回归：TabIcon 自 4112c01（8 月 19 日）诞生即如此，master 与 2.0.0-release 同样带病。

## Requirements

- R1：壳 CSP 的 `img-src` 放行 `https:`（`appProtocol.ts`），web 标签可加载远程 favicon。壳是受信 UI（不可信 web 内容都在独立 WebContentsViews/partition），放行风险可接受；CSP 其余指令不动。
- R2：`TabIcon` 的失败兜底必须可靠——不再依赖 React `onError` 首错：success-gate（onLoad 才显示 img，否则 globe）或 ref + 原生 error 监听。覆盖离线/坏站点图标场景。
- R3：测试：`tests/security/trustedSender.test.ts` 增加 `img-src` 含 `https:` 的断言；`tests/components/tabStrip.test.tsx` 增加"favicon 加载失败 → 显示 globe"用例（jsdom `fireEvent.error` 路径，实现前先证实在本仓 vitest 环境有效）；`tests/browser/tabManagerPageEvents.test.ts` 补 `page-favicon-updated` 事件覆盖。

## Acceptance Criteria

- [ ] 打包态（`pnpm build:win` 产物）中，访问 codeforces/acwing/nowcoder 等站点的标签显示各自真实 favicon（人工验证 + 研究报告中的 dist 复现脚本）。
- [ ] favicon 为 null 或加载失败的标签显示 globe 兜底，不再出现空白槽。
- [ ] `trustedSender.test.ts` 的 CSP 断言在 `img-src` 撤掉 `https:` 时变红（反向验证）。
- [ ] `pnpm test:ci` 全绿。

## Out of Scope

- favicon 走主进程代理转 data: URL 的长期方案（研究选项 3）——若未来要持久化图标到会话快照再立项。
- 内部页（algo://）标签的图标体系。

## Notes

- 顺序约束：**在阶段 0（PR #4）合入 dev 之后再实现**——phase-0 的全仓 prettier 格式化会与任何基于旧 dev 的分支产生冲突风暴；本任务分支从合入后的 dev 切出。
- 排查报告（管道映射 file:line、复现方法、修复选项权衡）见 2026-10-31 会话日志。
