# Architecture Tests 说明

## 1. 职责

`tests/architecture/` 存放架构红线检查。它用静态扫描把项目契约里最容易回归的边界变成自动验证，避免后续重构时把旧实现或高风险入口带回来。

## 2. 当前检查

`check-architecture.mjs` 当前覆盖 11 条。

安全边界：

- 运行时代码不得重新导入或实例化 Electron `BrowserView`。
- Renderer 源码不得直接访问 `ipcRenderer`。
- `preload.ts` 不得暴露通用 `ipcRenderer`、`send` 或 `invoke` 能力。
- 普通 IPC handler 必须走 `trustedSender` 门面，不得直接 `import { ipcMain }`。
- 窗口相关 shell 动作必须从 trusted sender 解析归属，不接受全局 window/TabManager getter。
- Nowcoder 实时提交链路不得引用通用 DOM verdict observer，必须保留 `nowcoder-judge-status` 网络 payload。
- VJudge 实时提交链路不得引用通用 DOM verdict observer，必须保留 solution/status 强关联 token。
- 依赖真实 Electron 的用例必须在 `vitest.config.ts` 排除且由 `tests/verify.mjs` 接管。

分层与设计系统（棘轮白名单，只减不增）：

- 裸 SQL 只允许出现在 `electron/db/` 下。判定口径是对 `db` / `database` / `getDb()` 调 `prepare` / `exec`，不按 SQL 关键字计数（关键字会命中注释，也漏掉动态拼表名；而限定方法名会把 `regex.exec()`、`installer.prepare()` 算成违规）。
- Renderer 组件与 hook 不得直连 `window.electronAPI`，只有 `*Api.ts` 可以。`src/main.tsx` 豁免：它同步读取 preload 注入的布局常量，不是 IPC 调用，且已是入口文件。
- 交互控件从 `src/components/ui/` 取用。`checkbox` / `radio` / `range` 按类型豁免，因为 `ui/fields.tsx` 还没有对应组件；补齐后删掉豁免，届时有 6 处要改。

## 3. 棘轮白名单

后三条带迁移期白名单，每个条目记录当前命中数作为预算。三类失败：白名单外出现命中、白名单内超出预算、白名单留着已清理的陈旧条目。

第三类容易被当成洁癖，但它是这套机制能收敛的原因：少了它，白名单会一直挂着已经还完的欠账，下次有人往那个文件加违规时守卫不会响。归位 `problemVisitRepository.ts` 时正是这条把陈旧条目报了出来。

白名单条目注明属于哪一类：**长期例外**（浏览器原生 chrome 的像素级几何、Coach 独立视觉域）或**待清理欠账**。只有后者应该随清理下降。

## 4. 守卫自身的反向验证

守卫全部 PASS 只说明当前代码合规，不说明守卫真的会响。判定逻辑因此拆到 `guards.mjs`，由 `guards.test.ts` 用合成输入推到失败侧：误报源（`regex.exec`）、豁免边界（属性换行、相邻元素的 `type`）、棘轮三类失败分支逐个覆盖。

新增守卫时一并补反向用例，否则守卫是装饰。

## 5. 验证入口

```powershell
cd algo-electron
npm run test:architecture
```

守卫自身的反向用例随 `npm run test:unit` 跑（`guards.test.ts`）。发布前使用：

```powershell
npm run test:all
```

## 6. 维护边界

- 新增架构红线时，优先写成明确、低误报的静态检查，并同时补反向用例。
- 不用本测试约束普通命名，例如 renderer helper 中的 `hideBrowserView` 只是 UI 语义，不代表 Electron `BrowserView` 依赖。
- 如果确实需要改变浏览器容器、IPC 暴露方式或 Nowcoder/VJudge 实时入库策略，先更新 ADR、设计文档和相关 adapter/submissions 测试。
- 白名单预算只减不增。要往白名单文件里加违规时，先清理该文件的欠账，不要上调数字。
