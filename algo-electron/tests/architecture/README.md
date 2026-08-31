# Architecture Tests 说明

## 1. 职责

`tests/architecture/` 存放架构红线检查。它用静态扫描把项目契约里最容易回归的边界变成自动验证，避免后续重构时把旧实现或高风险入口带回来。

## 2. 当前检查

`check-architecture.mjs` 当前覆盖 15 条。

安全边界：

- 运行时代码不得重新导入或实例化 Electron `BrowserView`。
- Renderer 源码不得直接访问 `ipcRenderer`。
- `preload.ts` 不得暴露通用 `ipcRenderer`、`send` 或 `invoke` 能力。
- 普通 IPC handler 必须走 `trustedSender` 门面，不得直接 `import { ipcMain }`。
- 窗口相关 shell 动作必须从 trusted sender 解析归属，不接受全局 window/TabManager getter。
- Nowcoder 实时提交链路不得引用通用 DOM verdict observer，必须保留 `nowcoder-judge-status` 网络 payload。
- VJudge 实时提交链路不得引用通用 DOM verdict observer，必须保留 solution/status 强关联 token。
- 依赖真实 Electron 的用例必须在 `vitest.config.ts` 排除且由 `tests/verify.mjs` 接管。

验证口径本身（测试的测试）：

- `test:core` 必须跑整个 Vitest 套件，`runCoreSuite()` 里不得给 `runVitest()` 传文件名单。这条是补出来的：原先那份手工维护的 15 项名单只覆盖 103/150 个文件，`tests/adapters`、`tests/submissions`、`tests/shared`、`tests/diagnostics`、`tests/shortcuts`、`tests/tracking` 与 4 个 `tests/security` 文件从没进过名单——门是绿的，那些目录的改动却没人验。名单式写法省下 1.4s 墙钟，换来的是门本身不可信。
- 测试必须断言行为而非生产源码文本。读源码再断言字符串的测试两头都会骗人：接线断了但字符串还在时它照样绿，纯搬移没改行为时它却变红。白名单条目失效后必须删。

分层与设计系统（棘轮白名单，只减不增）：

- 裸 SQL 只允许出现在 `electron/db/` 下。判定口径是对 `db` / `database` / `getDb()` 调 `prepare` / `exec`，不按 SQL 关键字计数（关键字会命中注释，也漏掉动态拼表名；而限定方法名会把 `regex.exec()`、`installer.prepare()` 算成违规）。
- Renderer 组件与 hook 不得直连 `window.electronAPI`，只有 `*Api.ts` 可以。`src/main.tsx` 豁免：它同步读取 preload 注入的布局常量，不是 IPC 调用，且已是入口文件。
- 交互控件从 `src/components/ui/` 取用。`checkbox` / `radio` / `range` 按类型豁免，因为 `ui/fields.tsx` 还没有对应组件；补齐后删掉豁免，届时有 6 处要改。

按文件豁免（不进棘轮）：

- 颜色只能来自设计 token，`src/` 下任何 CSS/TS/TSX 不得出现裸 hex。白名单是三个颜色定义文件：`src/index.css`（token 唯一源）、`src/features/coach/styles/tokens.css`（Coach 独立视觉域的第二套 token）、`src/shared/display.ts`（平台品牌色与图表色板，已过 dataviz 校验）。这条**不用棘轮预算**：预算条目意味着"应该降到零"，而定义 token 不是欠账，新增一个合法 token 不该让守卫响，所以按文件豁免而不按数量计数。
- `src/index.css` 里 `@theme` 与 `@import "tailwindcss"` 必须同时在场。`@theme` 是 Tailwind v4 指令而非标准 CSS，44 个 token 靠插件编译成 `:root` 自定义属性，全项目 111 个 `var(--…)` 消费；少了 import 浏览器会整块忽略，配色全退回默认值（实测产物 12841 → 3686 字节，`--color-app` 出现 0 次）。反向也判：留着 import 而 `@theme` 没了说明 token 源被搬走，同样要报。

  这条是被一次错误结论逼出来的：Tailwind 工具类确实零消费者（最后一处在 `ErrorBoundary`，Q4 已移除），但由此推出"可以删依赖"是错的 —— 它现在的身份是 token 编译器与 CSS 重置来源，不是工具类框架。产物里那些 `.flex` / `.filter` / `.table` 是 v4 扫描源码时把 `Array.prototype.filter`、行文里的「table」误判成类名生成的空转结果，不能当作"有人在用工具类"的证据。

## 3. 棘轮白名单

分层与设计系统那三条带迁移期白名单，每个条目记录当前命中数作为预算。三类失败：白名单外出现命中、白名单内超出预算、白名单留着已清理的陈旧条目。

第三类容易被当成洁癖，但它是这套机制能收敛的原因：少了它，白名单会一直挂着已经还完的欠账，下次有人往那个文件加违规时守卫不会响。归位 `problemVisitRepository.ts` 时正是这条把陈旧条目报了出来；裸控件那四个文件（ProblemSidebar / NoteEditorPane / UserScriptEditor / ErrorBoundary）清零后，也是这条强制把条目删掉的。

白名单条目注明属于哪一类：**长期例外**（浏览器原生 chrome 的像素级几何、Coach 独立视觉域）或**待清理欠账**。只有后者应该随清理下降。

## 4. 守卫自身的反向验证

守卫全部 PASS 只说明当前代码合规，不说明守卫真的会响。判定逻辑因此拆到 `guards.mjs`，由 `guards.test.ts` 用合成输入推到失败侧：误报源（`regex.exec`、HTML 数字实体 `&#8804;`）、豁免边界（属性换行、相邻元素的 `type`）、棘轮三类失败分支逐个覆盖。

反向用例不是形式主义：`countBareHex` 的 HTML 实体排除本来只写在注释里没实现，是 `guards.test.ts` 把它报出来的（`&#8804;` 的 `8804` 正好 4 位十六进制，后面的分号还能过尾部检查，只有前缀 `(?<!&)` 能区分）。

`coreSuiteRunsEverything` 的四个反向用例里有一个专门钉"找不到 `runCoreSuite` 时判为不合格"：正则匹配不到就默认放行，是这类守卫最常见的静默失效方式——函数改名之后守卫再也不会响，而它仍然报 PASS。

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
