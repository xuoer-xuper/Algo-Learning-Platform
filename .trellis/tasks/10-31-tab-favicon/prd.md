# 修复标签页 favicon——首标签固定地球图标、其余标签图标加载不出

## Goal

标签条每个 web 标签显示所在站点的真实 favicon。当前（截图实证，2026-10-31）：第一个标签无论什么站点都显示固定的地球默认图标，其余标签无论什么站点都只显示空白页占位图标——**没有任何标签能显示真实图标**。

## Root Cause（trellis-research 两轮实测，2026-10-31；第二轮逐站记录了真实 `page-favicon-updated` 载荷与时间戳）

三个叠加缺陷（修正：初版假设"部分平台交付 data: URL 所以打包态能显示"**被实测推翻**——7 站全部交付 `https:` URL，打包态在修复前不存在任何"真实图片"状态；用户"有的是图片"的观察最可能是把 dev 态现象混入了打包态描述，dev 矩阵实测恰为"6 站图片 + AcWing 地球"）：

1. **主因：壳 CSP 禁远程图片**——`electron/app/appProtocol.ts:14` 的 `img-src 'self' data: blob: note-asset:` 挡掉全部 https: favicon（独立探针实测 `app://` 协议上的 CSP 头确实被 Chromium 强制执行）。打包态 favicon 功能自 CSP 引入（a004d3c，8 月 17 日）起从未工作过；dev 态 Vite 无 CSP 所以从未暴露。
2. **次因：onError 首错丢失**——React 19 对新建 img 的首次 error 事件在监听器挂上前已发生（src 在元素创建期开始加载；`key={tab.favicon}` 每次重挂都丢首错）。CSP 拦截属于"创建期即失败"→ 兜底永不触发 → 空白槽；而"迟到网络错误"（img 已挂载后 403）onError 能接到 → 落地球。两种失败路径行为不同，兜底必须两者都覆盖。
3. **AcWing 专属：CDN 空 Referer 防盗链**——`cdn.acwing.com` 图标对无 Referer 请求一律 403，任意非空 Referer 200（curl 三组实测）；而 TabStrip 的 favicon img 显式 `referrerPolicy="no-referrer"`（TabStrip.tsx:85）→ 必 403。这是 dev 态"AcWing 单独加载不出来"的完整解释。

另有"有标题的地球标签"（VJ/PTA/洛谷/LeetCode）= `favicon === null` 的过渡态：favicon 事件滞后 0.6–22 秒（VJudge 实测 22s）、会话恢复标签起始 null、无声明站点靠默认回退事件——事件驱动 + 慢源的自然形态，修复 1/2/3 后只是短暂过渡，**不做**"导航后置空重等"（Chromium 导航时已发空数组事件清旧图标，置空重等反造闪烁）。

非 B5 回归：TabIcon 自 4112c01（8 月 19 日）诞生即如此，master 与 2.0.0-release 同样带病。

## Requirements

- R1：壳 CSP 的 `img-src` 放行 `https:`（`appProtocol.ts`），web 标签可加载远程 favicon。壳是受信 UI（不可信 web 内容都在独立 WebContentsViews/partition），放行风险可接受；CSP 其余指令不动。
- R2：`TabIcon` 的失败兜底必须同时覆盖"创建期即失败"（CSP 拦截）与"迟到网络错误"（403/404）两条路径——不再依赖 React `onError` 首错（ref + 原生 error 监听 + `complete && naturalWidth === 0` 补判，或等价 success-gate）。
- R3：favicon img 不再显式禁用 Referer（删 `referrerPolicy="no-referrer"`）——AcWing 防盗链要求非空 Referer；同步修 tabStrip 测试里的旧断言。
- R4：测试：`tests/security/trustedSender.test.ts` 增加 `img-src` 含 `https:` 的按指令解析断言（反向验证：撤掉即红）；`tests/components/tabStrip.test.tsx` 增加"favicon 加载失败 → globe 兜底"与"新 URL 乐观重试"用例；`tests/browser/tabManagerPageEvents.test.ts` 补 `page-favicon-updated` 捕获/过滤/去重覆盖。

## Deferred（实测后明确不需要或后置）

- Fix 4 主进程代理 favicon 转 data: URL：仅当打包实测 AcWing 仍因 `app://` 文档不带 Referer 而 403 时升格为必做（届时 globe 兜底保底不空白）。
- Fix 5 `data:` 白名单补 `svg+xml`：实测无任何现存站点交付 data:，纯前瞻，暂不做。
- "导航后置空重等"的捕获时机改动：实测判定为反模式，不做。

## Acceptance Criteria

- [ ] 打包态（`pnpm build:win` 产物）中，7 站矩阵实测：6 站（codeforces/acwing*/nowcoder/vjudge/pta/luogu/leetcode 中的非 AcWing 站）显示真实 favicon；AcWing 在 Referer 随请求发出时也显示真实图标，否则 globe 兜底（升级 Fix 4 的判据）。
- [ ] favicon 为 null 或加载失败（任一路径）的标签显示 globe 兜底，不再出现空白槽。
- [ ] `trustedSender.test.ts` 的 CSP 断言在 `img-src` 撤掉 `https:` 时变红（反向验证，已实测）。
- [ ] `pnpm test:ci` 全绿。

## Out of Scope

- favicon 走主进程代理转 data: URL 的长期方案（研究选项 3）——若未来要持久化图标到会话快照再立项。
- 内部页（algo://）标签的图标体系。

## Notes

- 顺序约束：**在阶段 0（PR #4）合入 dev 之后再实现**——phase-0 的全仓 prettier 格式化会与任何基于旧 dev 的分支产生冲突风暴；本任务分支从合入后的 dev 切出。
- 排查报告（管道映射 file:line、复现方法、修复选项权衡）见 2026-10-31 会话日志。
