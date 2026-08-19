# 浏览器化壳层大重构计划（Browser Shell Refactor Plan）

> 状态：**已确认，待实施**（2026-08-16 起草并完成联网查缺补漏；决策点 D1-D30 已由用户拍板）
> 范围：窗口/浮层体系、标签页体系、拆分窗口、工具栏与交互、账户密码管理、视觉与动效
> 版本基线：`2.0.0-beta.2`，master @ `0a1a1c4`（前端设计系统与全站视觉统一基线）
> 执行约束：后续功能重构必须保持 `0a1a1c4` 的视觉语言、颜色、排版、组件形态与动效基调；除修复明确缺陷或计划列出的暗色/无障碍任务外，不做二次视觉改版。

---

## 1. 目标

把应用的 UI 与交互整体向 Chrome 浏览器看齐，一次性解决七项诉求：

| # | 诉求 | 重构后的形态 |
|---|---|---|
| G1 | 浮窗分层混乱、新增/修改浮窗极其麻烦 | 浮层只保留一种统一 DOM Dialog 机制；6 个功能浮窗全部消灭，"截图替身"机制整体删除 |
| G2 | 全部 UI 与交互向 Chrome 靠拢 | 标签页承载一切（含内部功能页）、omnibox、快捷键体系、三点菜单、**右键菜单体系（用户点名重点，完整规格见 B2.8）** |
| G3 | 拆分窗口与原窗口完全一致，原窗口可随意退出 | 多窗口对等壳架构：每个窗口 = 完整壳（标签栏+工具栏），标签可拖出/拖回，任一窗口可关 |
| G4 | 元素堆叠效率低、按钮复杂 → Chrome 式收纳；重要功能改开标签页 | 工具栏收敛为 导航簇+地址栏+≤3 常用钮+三点菜单；设置/看板/脚本/Coach 指标/题目详情/笔记 全部标签页化 |
| G5 | 个人账户管理：保存平台密码、登录自动填充 | CredentialVault（safeStorage 加密）+ 登录捕获提示保存（Chrome 主路径）+ 登录页探测与主进程注入填充 + 设置内账户中心 |
| G6 | 简洁、高级、美观，动画流畅 | 唯一设计 token 源 + 基础组件库 + 统一图标 + CSS/View Transitions 动效体系 |
| G7 | 脚本导入不完善、无法更新，要适配油猴方便使用现成脚本 | Tampermonkey 兼容层：==UserScript== 全键解析、(namespace,name) 身份与覆盖更新、@version+@updateURL 更新链、Greasy Fork 点击即装、GM API 子集（覆盖 21 个热门竞赛脚本画像）、@connect 安全模型 |

不在本次范围：同站点多账号并行登录（per-account session 分区）、打印、完整历史管理页与书签系统（omnibox 历史补全在范围内）、移动端/多平台适配、AI Coach 功能扩展（仅做多窗口兼容改造）。

---

## 2. 现状诊断（调研结论摘要）

以下事实均经代码核实，引用格式 `文件:行号`（相对 `algo-electron/`）。

### 2.1 浮窗与分层（G1 根因）

- WebContentsView 永远绘制在 React DOM 之上（Electron 平台事实）。现行规避方案是**截图替身**：打开任意浮窗前先截活动标签图 → `removeChildView` 摘除网页 → 把截图铺成假背景（`src/hooks/useAppModalState.ts:17-26`、`src/components/ModalLayer.tsx:26-38`）。浮窗期间网页冻结成图片、不可交互，打开有 await 截图延迟，关闭瞬间消失无动画。
- 6 个功能浮窗（设置/看板/脚本/Coach 指标/题目详情/笔记）全走这套机制（`src/App.tsx:99-143`），每新增一个浮窗要改 4-5 个文件。
- 浮层机制五套并存、无统一 z 体系：ModalLayer(z-index:100)、桌宠窗内气泡(z-index:10)、6 处阻塞式原生 `confirm()`（4 个文件）、原生文件对话框、undocked DevTools；桌宠 `alwaysOnTop` 盖住应用内一切（`electron/coach/CoachPetWindow.ts:74`）。
- 布局常量 42/36 硬编码 4 处：`electron/browser/tabManagerConfig.ts:7-8`、`electron/browser/BrowserHost.ts:4`（遗留层）、`src/components/ModalLayer.tsx:3-5`、`src/styles/app-shell.css:29,40`，横跨主进程与 renderer。

### 2.2 标签页与工具栏（G2/G4 根因）

- 标签只支持 新建/关闭/切换/双击拆出 四种操作，上限 8 个且超限**静默失败**（`TabManager.ts:145-147`）；无拖拽排序/拖出手势/固定/中键关闭/恢复关闭/右键菜单/favicon/加载指示；关闭标签后激活 Map 末位而非右邻。
- 标签模型只认远程 URL（`tabManagerTypes.ts:3-8` 仅 id/url/title/isActive），内部功能页全部游离在标签体系外；renderer 无路由器。
- 快捷键近乎为零：唯一监听挂在壳 webContents 上（`main.ts:94-108` 仅 DevTools），焦点在 OJ 页面内时全部失效；应用菜单被删（`main.ts:29`）。
- `window.open`/`target=_blank` 被强制改写为**当前标签跳转**（`TabManager.ts:67-84`），与所有浏览器直觉相反。
- 地址栏是纯 input：非 URL 输入拼成非法 `https://xxx` 而非搜索（`useBrowserNavigation.ts:17-22`）；数据库已有 `problem_visits` 历史却不做补全。
- 工具栏 42px 一行塞 12 个元素，图标 Unicode/emoji/内联 SVG 三种风格混用（`BrowserToolbar.tsx:38-76`）。

### 2.3 拆分窗口（G3 根因）

- `DetachedWindow` 是 55 行裸窗口：原生边框（与主窗口 frameless 视觉分裂）、无标签栏/工具栏/地址栏、不能新建标签/拖回/再拆、关窗即销毁 webContents（`DetachedWindow.ts`）。
- 拆出即脱离 TabManager：题目追踪、访问追踪（problem_visits 停记）、用户脚本注入**静默失效**（`findTabByView` 返回 null 全部哑火）；实时提交主链路因 session 级早注入存活，但 iframe 注入与重试丢失（部分降级）。
- **合规漏洞**：ContestGuard 比赛守卫唯一事件源是 activeTabChange（`CoachOrchestrator.ts:232-240`），同一标签内导航进比赛页**漏检**，拆出窗口里进比赛页**完全失守**——违反"比赛模式默认开启不可绕过"的硬边界（`docs/DESIGN/AI_COACH_ARCHITECTURE.md`）。
- 单例架构是结构性障碍：`win`/`tabManager` 是 `main.ts` 模块级单例，全部 IPC handler 无视 `event.sender`（`registerBrowserShellIpc.ts` 全文）；主窗口关闭即销毁全部服务与桌宠（`main.ts:159-170`），拆分窗口成为无壳孤儿，Windows 上无任何入口重开主 UI。

### 2.4 账户与凭据（G5 现状）

- 保存密码 + 自动填充的四大件**全缺**：无凭据表（migration 001-024 无）、无 credentials IPC、设置页无账户面板、无表单探测/填充脚本。登录完全人工，靠 `persist:oj-main` 持久 session 续期。
- 可复用资产充足：`safeStorage` 加密模式已有完整样板（`LlmConfigStore.ts`：不可用即拒绝保存 + 脱敏返回 + legacy 迁移，且被安全守卫测试钉死）；三条页面注入通道成熟（ojPreload 隔离世界 / 主世界 executeJavaScript / 用户脚本引擎）；`cookies:getSiteSummary` 登录态摘要 IPC 已建好但 renderer 从未消费。
- migration 最新编号 **024**，新表从 025 起；`platform_accounts` 表只服务 rating handle 绑定，无凭据概念。

### 2.5 UI 与样式（G6 现状）

- 三方混用：Tailwind v4 已接入但仅 scripts 域在用；主体是 10 个手写 CSS 共 3675 行；29 处内联 style。
- token 名存实亡：两份互相冲突的 `:root`（`index.css:3-21` vs `app-shell.css:2-17`）靠加载顺序定胜负；`--accent`/`--bg-code` 被引用却未定义；109 处硬编码色值；浅色主题混用 Catppuccin 暗色粉彩状态色（`src/shared/display.ts:48-67`）；无暗色模式。
- 零基础组件：12+ 套按钮类、5 种关闭按钮、3 套统计卡片、跨 feature 抄 CSS 类名（ProblemDetail 借 settings 类）。
- 动画两极分化：全应用仅 21 处 hover 微过渡；keyframes 全在桌宠域；弹窗开关/标签切换/侧栏折叠全部生硬直跳。

### 2.6 CI 硬门槛实测（排期的真正约束）

- **包体余量极大**：entry 实测 192,201 字节，上限 1,443,845，余量约 1.19 MB（86.7%）。字节预算完全不是瓶颈；真正的雷是门槛脚本硬编码 5 个懒加载 chunk 文件名正则（`checkRendererBundle.mjs:44-50`），SettingsPage/Dashboard/CoachMetricsView/CoachChatPanel/MilkdownEditor 改名/合并即红灯。
- **覆盖率仍接近门槛**：在 `0a1a1c4` 基线上重新实测为 28.91/34.66/24.60/29.63，对门槛 28/34/24/29 的余量分别仅 0.91/0.66/0.60/0.63pp。jsdom、Testing Library 与 `uiComponents.test.tsx` 已落地，`src/components/ui` 当前 100% statements/functions/lines，但绝大多数 feature TSX 仍为 0%；新增 UI 与 Electron 绑定模块仍必须测试同 PR 落地。
- 结论：排期必须"测试与 UI 同 PR 落地"；主进程新增代码可为覆盖率蓄分子，但 electron 绑定模块必须先做 DI 拆分（见 §5 覆盖率纪律）。

### 2.7 地基体检结论（2026-08-16，五维体检）

**技术栈判定：全部合适，无需更换任何选型，也无需版本升级任务。** 逐项核实（含 Web 检索确认版本现状）：Electron 43.4.0 即当前 npm latest（2026-08-11 发布，支持窗口 41/42/43 内，44 尚在 beta）；WebContentsView 是本产品的唯一可行路线（Tauri 无 per-view 输入拦截/隔离世界 preload/跨窗口 view 过户，纯 Web 被 OJ 站 X-Frame-Options 判死）；React 19.2.8 / Vite 8.2.1（rolldown 正式内核，非实验包）/ better-sqlite3 13 / electron-builder 26 全部为 latest；官方源 `npm audit` 0 漏洞。"无状态库/无路由库"在标签化架构下反而更正确（唯一事实源在主进程 TabManager）。两项需治理：① Tailwind v4 半采用（B1.1 已排）；② TypeScript 7.0.2 领先生态，typescript-eslint 尚不支持 TS7，**lint 层零类型感知**（no-floating-promises 等缺位）——并入 B0.6 启用 eslint 核心 async 守卫规则，生态跟上后再接回标准链。

**基础健康：代码纪律异常干净**（全仓 0 TODO/FIXME、0 @ts-ignore、仅 17 处 as any、契约/架构/安全/文档守卫完备；数据层 WAL/外键/busy_timeout/迁移事务/backup API 配置正确），**但"日常主力浏览器"级健壮性有 1 critical + 13 major 缺口**，已全部编入阶段任务：

| 严重度 | 问题 | 归属 |
|---|---|---|
| critical | 主进程无 uncaughtException/unhandledRejection 兜底、whenReady 链无 catch——DB 损坏/迁移失败=无窗口无提示的僵尸进程 | **B0.8** |
| major | 全应用无 render-process-gone/unresponsive 处理：OJ 标签崩溃=死白区域，壳崩溃=整窗白屏只能 Alt+F4 | B0.8（壳）+ B2.1（标签占位页） |
| major | 无单实例锁：双开共用 userData，OJ 登录态分区与 config.json 有损坏风险 | **B0.9** |
| major | 零落盘日志（39 处 console 打包后不可见、111 处静默吞错）——排查全靠裸奔 | B0.8 |
| major | 每条新提交触发全史逐日重算且 LIKE 不走索引（一年数据实测 970ms 同步阻塞主进程；改范围谓词后 12ms） | **B0.10** |
| major | migration 前无自动备份（历史 24 个迁移中 5 个重写数据；本计划还要加 025/026/027） | B0.10 |
| major | 会话不恢复：重启后标签全丢、窗口 bounds 不记忆（Chrome 基线能力缺失） | B2.1（标签）+ B3.1（bounds） |
| major | OJ 页面权限请求（摄像头/麦克风/定位）默认全批准 | B0.2 |
| major | Electron fuses 未配置：OJ 会话 cookie 明文落盘（EnableCookieEncryption 关）、打包 exe 可被 --inspect 附加/当 Node 用 | **B4.6** |
| major | 「默认主页」设置项全链路半接线（UI/IPC 齐全但运行时无消费者） | B2.2 |
| major | 「sites 双源」实为「一源已死」：SiteRegistry 创建即丢弃，cookiePolicy 全链零消费 | B4.3（升级定性） |
| major | 普通 IPC handler 未验证 sender/senderFrame/origin，远程 OJ view 或未知 frame 缺少统一拒绝边界 | **B0.12** |
| major | 生产壳仍从 file:// 加载且 index.html 无 CSP，可信壳 origin 与资源策略不稳定 | **B0.12** |
| major | `ojSession` 为广泛 XHR/OPTIONS 响应改写 CORS 头，用户脚本跨域能力与整个 OJ session 安全边界耦合 | **B6.3，B4 前置** |

minor 项（KaTeX 1MB 死重、@milkdown/theme-nord 零引用依赖、public/home.html 等死资产、notes 无 repository、visit 关闭语义、Coach 单会话假设、导出白名单不实、smoke preload 无门控等）已分别并入对应任务，见 §5 各阶段与 §7.2 D13/D14。**明确不并入本次**：自动更新（单独立项）、nowBeijing 改名（零行为收益）、CI npm audit 步骤（可选小任务）。

### 2.8 用户脚本系统（G7 根因，2026-08-16 专项调研 + 油猴规范对照）

现状是"最小可用"级引擎，与 Tampermonkey 的差距是全方位的：

- **"无法更新脚本"的确切机理**：导入无同名去重恒新建（`registerScriptsIpc.ts:52-61`）、@namespace 不解析故无 (namespace,name) 身份键、`user_scripts` 表无 UNIQUE 约束、@version 只存字符串全库无版本比较、无 @updateURL/@downloadURL/检查更新——更新只能"删了重导"或手改 userData/userscripts 下 UUID 文件名的副本（用户无法对应哪个 UUID 是哪个脚本）。
- **metadata 解析仅 8 键**（`userScriptMetadata.ts:11-46`）：@namespace/@grant/@exclude/@noframes/@connect/@updateURL/@downloadURL 全部静默丢弃；@run-at 解析后零消费。
- **GM polyfill 11 个 API 但关键语义错位**：GM 值存"页面自身 localStorage"（跨脚本共享、站点可读写伪造、清站点数据即丢）；GM_xmlhttpRequest 是页面 fetch 包装（受 CORS 限制——而规范核心能力恰是跨域）；@grant 无视，全部 API 无条件挂 window.GM_*（可被 OJ 反作弊探测）；脚本裸注入无闭包（两脚本顶层同名冲突）。
- **注入覆盖面缺陷**：只打活动标签主 frame（后台标签零注入、加载-注入间切标签注错）、iframe 不注入、SPA 不重注、拆分窗口完全失效、失败无重试。
- **URL 匹配安全缺陷**：host 不锚定，`https://evil.com/x.codeforces.com/y` 会被 `*://*.codeforces.com/*` 误匹配（`userScriptMetadata.ts:48-55`）。
- **需求画像（Greasy Fork 实测 CF/LeetCode/洛谷 21 个最热脚本的 meta.js）**：@grant 频次 GM_addStyle=8、GM_xmlhttpRequest=7、GM_get/setValue=6、unsafeWindow=6、none=5、GM_registerMenuCommand=3；@run-at 声明 7 个（其中 4 个要求 document-start，如 Codeforces Better!——在现引擎下行为必然不正确）；GM_notification/GM_download/@resource 均为 0。→ 最小 API 子集清晰可界定。
- 可保留资产：metadata 解析骨架+测试、UserScriptService 双路匹配框架、user_scripts 表（增列即可）、6 条 IPC、executeScriptAcrossFrames；须重写：matchRuleToRegExp、GM polyfill 全套、importFile 流水线、注入调度。

---

## 3. 已实测验证的技术假设（Electron 43.4.0 spike，2026-08-16）

以下三项曾是方案选型的最大不确定性，已用临时脚本实测（脚本已删除，git 干净）：

| 假设 | 结果 | 关键数据 |
|---|---|---|
| WebContentsView 跨窗口过户 | **可行，选为拆分窗口主路线** | 真实 Codeforces 页面两窗口往返 6 次，每次 4-5ms，零重载、无空白帧；滚动/JS 状态/焦点/zoom 全保留；原窗口关闭后 view 存活。同尺寸窗口无需重设 bounds；跨 DPI 需过户后按目标窗口重设 |
| 未挂载 view 的后台节流 | **默认节流即 Chrome 后台标签行为** | 摘除即转 hidden：50ms 定时器压到 1/s、rAF 归零、媒体时钟照走；挂回 0.5s 内满速恢复。`setBackgroundThrottling(false)` 可保定时器但 rAF 仍为 0 |
| Chrome 式快捷键地基 | **per-view `before-input-event` 为主通道** | 焦点在网页内时 100% 到达、可精确 preventDefault 且不伤正常输入；菜单 accelerator 存在焦点/叠放相关失效边界，只作辅助。⚠️ 开发态 default_app 菜单 Ctrl+W 会误关窗口，必须显式 `Menu.setApplicationMenu` |
| View Transitions API | 可用（Chrome 150） | 用于壳 UI/内部页切换动效；WebContentsView 内容本身不做过渡（实测 remove/add 无闪烁，无需过渡） |

**附带发现（必须写进实现）**：窗口关闭**不会**自动销毁仍挂载其上的子 view webContents——多窗口 + 标签自由迁移后，所有窗口 close 路径必须按"view 归属表"显式移交或销毁，否则静默泄漏。

---

## 4. 目标架构

```
Main Process
├── protocol/appProtocol           # app://shell 生产壳 + CSP；algo:// 仅为内部 Tab 身份，不直接加载任意资源
├── windows/WindowManager          # 新增：Map<windowId, AppWindow>，窗口注册表 + view 归属表
│     AppWindow = frameless BrowserWindow + TabManager 实例 + 完整 React 壳
│     生命周期：任一窗口关闭只清理自己；最后一个壳窗口关闭 → app 退出
├── browser/TabManager (改造)      # tabs 有序数组；TabInfo{kind:'web'|'internal', internalPage?, favicon, isLoading, …}
│     adoptTab/releaseTab 过户原语（拆出/拖回复用同一原语）
│     事件 per-webContents 直挂（替代 findTabByView + activeTab 门控）
├── shortcuts/                     # 新增：应用菜单显式化 + per-view before-input-event 统一分发
├── credentials/CredentialVault    # 新增：site_credentials(migration 026) + safeStorage + 主进程注入填充
├── scripts/ 油猴兼容引擎（B6）    # metadata 全键解析 + 匹配器 + GM 桥 + @connect 网络代理 + 更新器 + .user.js 安装拦截
├── 服务层（多窗口化）             # SubmissionWatcher 广播全窗口；ContestGuard 聚合全窗口 URL；
│                                  # SessionTracker 任一窗口聚焦；TrackingService 多订阅
└── coach/CoachPetWindow           # 生命周期改挂 app 级；置顶策略可配

Renderer（同一构建产物，多窗口实例化——桌宠 hash 路由已证明此模式可行）
├── 壳：TitleBar(TabStrip+WindowControls) + Toolbar(导航簇+Omnibox+≤3 常用钮+三点菜单)
├── 内部页标签化：active tab 为 internal 时主进程摘除 view，React 渲染懒加载内部页
│     设置/看板/脚本/Coach 指标/题目详情/笔记 全部为内部页标签；地址栏显示 algo://settings 等受控内部标识
│     保留原文件名与 lazy 边界（守住性能门槛正则）
├── NoticeBar 通知条：内容区顶部布局让位（非浮层），承载 下载完成/保存密码询问/满额提示 等
├── components/ui/                 # 新增：Button/Input/Select/Card/Dialog/ConfirmDialog/DropdownMenu/Toast + 统一 SVG 图标
└── 设计系统：Tailwind v4 @theme 唯一 token 源；CSS transition + View Transitions 动效
```

**关键设计取舍**：

1. **内部页在壳层 React 内渲染，不开第二类 WebContentsView**。现有 isHome（url='' 时摘 view 显示 React 首页）已是同构机制，只是将其显式化进 Tab 模型。生产 React 壳从 `app://shell` 加载以建立稳定可信 origin；`algo://settings` 等仅是 Tab 状态与地址栏标识，不允许 renderer 请求任意本地路径。优点：零新进程开销、内部页共享壳状态、懒加载 chunk 文件名不动。
2. **拆分 = 新建完整壳窗口 + 标签过户**，而不是修补 DetachedWindow。`DetachedWindow` 与遗留 `BrowserHost` 随 B3 删除。
3. **浮层与活动 view 共存三分法（架构原则：任何浮层不与挂载中的 view 叠层）**。WebContentsView 永远盖住 DOM 是平台事实，删除截图替身后所有新浮层必须归入以下三类之一：
   - **菜单类**（三点菜单、标签右键、页面右键、编辑区右键）→ 原生 `Menu.popup()`：OS 层独立窗口绘制，天然在 view 之上，零叠层风险。右键菜单是一等交付物（用户点名重点，规格见 B2.8）；权衡说明：原生菜单观感由 OS 决定、不可自定义样式，换来的是零遮挡与零延迟——B5 若要自绘高级菜单再单独演进（需先解决子窗口 overlay 方案）。
   - **布局让位类**（下载/保存密码/提交询问用的 NoticeBar 通知条、Ctrl+F 查找条）→ 不做浮层，做布局插入：通知条/查找条占内容区顶部高度，view bounds 相应让位（复用现有 offset 机制扩展，Chrome 下载 shelf 同形态）。
   - **摘 view 全区面板类**（omnibox 聚焦后的建议面板）→ 聚焦地址栏即摘除 view、展示全内容区建议面板（Arc 式命令面板体验），失焦挂回。实测摘/挂无闪烁、恢复瞬时（§3），成本可忽略。
   - 全局 ConfirmDialog 只在内部页标签激活（view 已摘除）时使用；web 标签场景的询问一律走通知条。
4. **preload 保持扁平单层格式**（2 空格缩进、字面量 channel）：IPC 契约测试的解析器依赖此格式（`ipcContracts.test.ts:144`），不改嵌套命名空间，避免连带重写契约测试。
5. **IPC 通道按阶段集中修改 + 退役清单**（`ipcContracts.test.ts` 的事件锁定清单要求每个 on 通道必须有主进程发送方，无法预注册）：
   - B0 新增：`ui:command`（主进程→renderer 通用 UI 指令，随快捷键分发器同 commit）。
   - B2 退役：`browser:hideView`/`browser:showView`/`browser:capturePreview`（随截图替身删除，同步 coreContracts 清单与 `rendererScreenshotHarness.tsx` mock）；`browser:goHome` 语义改为"打开/切换 algo://home 标签"。
   - B3 新增：`window:listChanged`；退役 `tab:detach`（由 `tab:moveToNewWindow` 取代）。
   - 其余命令通道按阶段随任务落地：`tab:reorder`、`tab:reopenClosed`、`tab:openInternal`（含笔记/题目详情等带参内部页）、`tab:moveToWindow`、`browser:omniboxSuggest`、`browser:findInPage`、`browser:setZoom`、`credentials:list/delete/fill/confirmCapture`。壳 renderer 不提供接收或回传明文密码的 channel。
   - B6 新增：`scripts:checkUpdates`/`scripts:applyUpdate`/`scripts:install`（安装确认页回执）；GM 值读写与 GM_xmlhttpRequest 走独立受限 preload 桥（仿 ojPreload 提交桥模式，不进 electronAPI 白名单面）。
   - favicon/isLoading/kind 并入 `tab:listChanged` payload，不新增事件通道。

---

## 5. 分阶段实施计划

每阶段独立可发布、可回退；阶段内任务按编号推进，遵循既有开工声明/审查/文档流程。每阶段收尾强制自检：`npm run test:coverage` + `npm run test:performance`，阶段合入前跑 `npm run test:all`。

**覆盖率纪律（全程有效）**：新增 TSX 必须同 PR 配测试（组件测试或逻辑抽 .ts + node 测）；净增 UI 代码按"每 1000 行需自带 ≥15 函数/30 分支覆盖"预算。⚠️ 注意：**"主进程代码天然可测"只对纯逻辑成立**——WindowManager/shortcuts/CredentialVault 等新模块直接 import electron，在现有 vitest node 环境下无法导入（仓库无 electron mock 基建，electron 二进制专项测试又不计入 coverage），若不处理其覆盖率恒为 0 且全额计入分母。因此强制约定：**所有 electron 绑定的新模块必须按 LlmConfigStore 的依赖注入模式拆分**——状态机/纯逻辑放独立 .ts（node 可测），electron API 只留薄壳；B0.6 同时建立 electron test-double 基建（vitest alias/vi.mock），使薄壳也可覆盖。每阶段验收含"新增 electron 绑定文件的覆盖策略"检查。

### B0 地基与守卫（预计 20-28 小时）

低风险、立刻见效、为后续所有阶段铺路。B0.8/B0.9/B0.10 来自地基体检（§2.7），B0.11 来自脚本专项调研（§2.8），是"日常主力浏览器"的健壮性欠账，先于一切 UI 改造落地。

| 任务 | 内容 | 涉及 |
|---|---|---|
| B0.1 | 显式 `Menu.setApplicationMenu`（清除 default_app Ctrl+W 关窗雷）；快捷键分发器：per-view `before-input-event` + 壳 webContents 统一处理 Ctrl+T/W/Tab/Shift+T/L、Ctrl+1-8、F5/Ctrl+R、Ctrl+=/−/0（缩放）、Alt+←→；新增 `ui:command` 事件通道（聚焦地址栏等指令） | `electron/shortcuts/`（新目录）、`TabManager.createView`、`main.ts`、ipcContracts 事件清单 |
| B0.2 | OJ 页面行为治理：`window.open`/`target=_blank` 统一由 `setWindowOpenHandler({ createWindow })` 接管为受管 WebContentsView 标签，保留 about:blank、POST、OAuth 与 opener 语义，无法安全接管时拒绝并通知；**生产 loadURL 只允许 HTTPS**，开发/测试额外放行 localhost HTTP；未知协议默认拒绝，系统外部打开仅允许用户从显式菜单触发；persist:oj-main 与默认 session 同时安装 `setPermissionRequestHandler` 和 `setPermissionCheckHandler`，敏感权限默认拒绝 | `TabManager.ts:67-84`、`ojSession`、`navigationPolicy` |
| B0.3 | 标签基础体验：中键关闭、关闭后激活右邻、恢复关闭栈（记 url+title，Ctrl+Shift+T）；（已定 D8）MAX_TABS 提升至 16 且满额时 UI 提示（不再静默）；（已定 D11）Ctrl+W 于最后一个标签=重置为新标签页，B3 起改为关闭窗口 | `TabManager`、`TabBar` |
| B0.4 | **ContestGuard 聚合化修复（合规优先，不等多窗口）**：（已定 D3）比赛判定改为按 webContents 维度的 URL 快照集合聚合（任一 view 处于比赛页即全局静默）；事件源在 `createView` 时直挂裸 webContents 的 did-navigate（**不经 findTabByView/activeTab 门控**，修复同标签导航与后台标签漏检）；⚠️ 禁止使用单槽 `setNavigateCallback`（已被 problemTitleTracking 占用，覆盖即静默打断题目追踪链路——多播挂点是 `addNavigateListener`，但它同样受 activeTab 门控，故必须直挂）；聚合判定逻辑放独立模块注入，不向 CoachOrchestrator（已 1080 行）净增行数。**（已定 D12）同 commit 临时禁用双击拆出**：TabBar 双击入口下线，提示"拆分窗口将在多窗口版本以更完整形态回归"——**这是临时措施，B3.3 必须恢复拆分能力**（见 B3.3 与 D12 行） | `ContestGuard`、`CoachOrchestrator`、`TabManager`、`TabBar` |
| B0.5 | 布局常量收敛单一来源（主进程定义，注入 renderer），消灭 42/36 四份手抄 | `tabManagerConfig`、`ModalLayer`、CSS 变量 |
| B0.6 | 测试基建：jsdom + @testing-library 已由 `0a1a1c4` 落地，本任务继续建立 electron test-double 基建，使 electron 绑定薄壳可在 node 下覆盖；Playwright 选择器迁 `data-testid`；给追踪/标题/脚本注入三条静默降级链路加诊断出口；TS7 下启用 eslint 核心 async 守卫，并跟踪 typescript-eslint 恢复类型感知规则 | `vitest.config.ts`、`eslint.config.js`、`tests/ui/`、`tests/` |
| B0.7 | **死资产清扫**：删遗留 `BrowserHost`、删 `public/home.html`（git 跟踪的零引用死页面）、`genericTableSites.ts`/`specializedScraperSites.ts` 两个仅测试引用的转发壳（测试改直连后删除）、`syncService.setBrowserHost` 改名 `setScrapeHost`（命名残留）；（已定 D7）删除 `submissions:detected`/`problem:detected` 死发送通道（SubmissionWatcher/main.ts/registerBrowserShellIpc 三处发送点与 ipcContracts internalChannels 清单同 commit 清理）；顺手修正 `electron/ipc/README.md` 未列 registerCoachIpc 的滞后 | `electron/browser/`、`electron/adapters/`、`electron/submissions/` |
| B0.8 | **主进程兜底与落盘日志（critical 修复）**：`process.on('uncaughtException'/'unhandledRejection')` 兜底 + `whenReady` 链 `.catch` + 致命错误 `dialog.showErrorBox` 后退出（消灭"僵尸进程"路径）；壳 webContents `render-process-gone` 自动 reload；引入落盘 logger（electron-log 或自研滚动文件），兜底/迁移/崩溃/五条追踪链路必须接入（111 处静默吞错不必全改，关键链路优先） | `main.ts`、新 `electron/shared/logger` |
| B0.9 | **单实例锁**：`requestSingleInstanceLock` 拿不到即 quit；`second-instance` 聚焦已有窗口（B3.5 扩展为路由到 WindowManager）——消除双开损坏 OJ 登录态分区与 config.json 互相清写的风险 | `main.ts` |
| B0.10 | **数据层先行修复**：统计重算 LIKE 改 >=/< 范围谓词 + 提交路径只重算本批涉及日期（实测 970ms→12ms，B2.5 omnibox 高频读 problem_visits 前必须治）；应用启动改为异步数据库初始化，检测 pending migration 后先使用 SQLite backup API 备份到 userData/backups并轮换保留 3 份；任一迁移失败须关闭数据库、原子恢复备份、写失败标记并退出，禁止同版本无限重试；problem_visits 孤儿行启动清理（按 entered_at 封闭并标记） | `db/connection.ts`、`db/migrate.ts`、`backup/`、`tracking/` |
| B0.11 | **脚本更新止血（G7 先行，用户最痛点，完整油猴化见 B6）**：migration **025_userscript_identity**；解析 @namespace，导入按 (namespace,name) 查重——已存在即覆盖更新（保留用户的 site_ids/enabled 配置）；@version 比较提示升级/降级；"另存副本"生成独立 local namespace 并默认关闭自动更新；文件副本命名改可辨认的 slug 形式；存量重复项迁移为一个 canonical + 若干 local copy；时间戳改为北京时间 | `userScriptMetadata`、`registerScriptsIpc`、`db/migrations/` |
| B0.12 | **壳信任边界（新增硬前置）**：ready 前注册 `app` privileged scheme，生产壳从 `app://shell` 加载并加严格 CSP；开发仅信任 Vite localhost；新增 `handleFromShell/onFromShell` 中央注册器，校验 sender、senderFrame、main frame、origin 与窗口归属，全部普通 IPC 必须迁入；OJ 提交、登录捕获、userscript bootstrap 分别使用专用 sender validator；安全测试覆盖远程 view、iframe、未知 webContents、伪造 origin 与畸形 payload | `appProtocol`、`ipc/trustedSender`、全部 IPC 注册器、security tests |

验收：快捷键（含缩放）在 OJ 页面焦点下全部生效；OJ 站内 `_blank` 链接开新标签且非 http/https 协议被丢弃；OJ 页面请求摄像头/定位被拒绝；比赛页在同标签导航、后台标签导航下均触发静默且退出比赛页解除；题目检测/访问追踪回归正常（防 B0.4 挂点破坏）；双击拆出已禁用且有"B3 回归"提示；kill 渲染进程后壳自动恢复；双开第二实例聚焦已有窗口；模拟 initDb 抛错弹出错误框而非静默退出；日志文件落盘可见；重算基准测试 <50ms；重复导入同一脚本=覆盖更新而非新建两行；`test:all` 绿。

### B1 设计系统（预计 6-10 小时）

> **当前基线（`0a1a1c4`，状态 `[x]`）**：Button/IconButton、Input/Select/Textarea、Card、ConfirmDialog、统一 Icon、jsdom、Testing Library 与全站视觉统一已经落地。本阶段已补齐 Dialog/DropdownMenu/Toast/NoticeBar、无障碍、剩余 token 治理和明确缺陷；禁止重新设计现有页面。

| 任务 | 内容 | 涉及 |
|---|---|---|
| B1.1 | Tailwind v4 `@theme` 建唯一 token 源：语义色（含状态色替换 Catppuccin 粉彩）、间距 4 档、圆角 3 档、阴影 3 档、动效时长/缓动 3 档；删两份冲突 `:root`；补 `--accent`/`--bg-code`；暗色模式 token 双值预留 | `src/index.css`、`app-shell.css`、`display.ts` |
| B1.2 | 基础组件库 `src/components/ui/`：Button（primary/ghost/danger/icon）、Input、Select、Card、Dialog、ConfirmDialog、DropdownMenu、Toast；全部带 `data-testid` 与组件测试。**浮层归类约束（§4 三分法）**：DropdownMenu/Dialog/ConfirmDialog 仅用于内部页场景（view 已摘除）；web 标签场景的菜单走原生 `Menu.popup`、询问走通知条组件 NoticeBar（布局让位型） | 新目录 + README |
| B1.3 | 统一 SVG 图标组件集（替换 Unicode/emoji/内联 SVG 三方混排） | `src/components/ui/icons/` |
| B1.4 | 原生 `confirm()` 全量替换（实测 **6 处 4 文件**：`SiteManagementPanel.tsx:54`、`ProblemDetail.tsx:42,49`（删题+删笔记二连问，需设计为单个带选项的 ConfirmDialog）、`UserScriptManager.tsx:78`、`NotePanelModal.tsx:47,96`） | 各 feature |
| B1.5 | 逐 feature 收编：12+ 套按钮类、5 种关闭按钮、3 套统计卡片迁移到 ui/ 组件；scripts 域 Tailwind 临时样式收编；顺手删除零引用依赖 `@milkdown/theme-nord`（实际主题来自 crepe 包内 nord.css），notes.css 的 `--crepe-*` 覆盖改用 token | 各 feature CSS、package.json |

验收：全应用无原生 confirm；按钮/卡片视觉统一；`test:coverage` 四项不低于基线；Playwright 截图基线按流程更新。

### B2 标签体系 Chrome 化（单窗口内）（预计 20-28 小时）

| 任务 | 内容 | 涉及 |
|---|---|---|
| B2.1 | Tab 模型扩展：`kind:'web'\|'internal'`、受校验的 `InternalPage` 判别联合、favicon、isLoading、isCrashed；tabs Map→有序数组；`tab:listChanged` payload 扩展；会话恢复使用可序列化 `TabSnapshot`，原子保存窗口/标签/激活项且不写表单、密码、脚本源码；render-process-gone 时摘除坏 view 并显示恢复页，unresponsive 时 NoticeBar 提供等待/重载/关闭 | `tabManagerTypes`、`TabManager`、preload |
| B2.2 | 内部页标签化：首页=`algo://home`、设置、看板、脚本、Coach 指标、题目详情、笔记、凭据中心与脚本安装确认页全部成为内部标签；生产壳实际由 `app://shell` 自定义协议加载，`algo://` 仅作受控内部页标识；新标签和无恢复会话时始终进入内部 home；删除 defaultHomeUrl 面板、IPC 与配置字段，旧 URL 一次性迁移为主页快捷入口；保留现有组件文件名、lazy 边界和当前视觉样式 | `App.tsx`、`ShellRouter`、各入口、`DefaultHomePanel`、`appProtocol` |
| B2.3 | **删除截图替身三件套**（`useAppModalState`/`useBrowserViewVisibility`/`ModalLayer`）+ 通道退役（`browser:hideView`/`showView`/`capturePreview`，`goHome` 改语义）；落地 NoticeBar 通知条机制：view bounds 支持顶部让位（扩展现有 offset 机制），供 B2.7 下载提示、B4 保存密码询问复用 | hooks、`tabViewLayout`、`components/ui/NoticeBar`、**`ipcContracts.test.ts` coreContracts 同 commit 删项、`rendererScreenshotHarness.tsx` mock 同步** |
| B2.4 | TabStrip 重写：favicon+加载 spinner、pointer 拖拽排序（`tab:reorder`）、新建/关闭动效；处理与 `-webkit-app-region: drag` 的手势冲突（拖拽区收窄到空白区）；标签右键菜单规格见 **B2.8** | `TabBar` → `TabStrip` |
| B2.5 | Omnibox + 工具栏收敛：输入解析内部路由/HTTPS URL/搜索三分流；默认 Bing，可选 Google/Baidu，自定义模板必须为 HTTPS 且仅含一个 `{query}`；建议只读本地 `problems`/`problem_visits`，不接远程联想；聚焦即摘 view 展示全区建议面板；工具栏继续沿用 `0a1a1c4` 的视觉基线，只做功能收纳，不改颜色、排版、按钮外观与动效基调 | `BrowserToolbar` → `Omnibox`+`AppMenu`、`browser:omniboxSuggest` |
| B2.6 | Playwright 用例重写：`.modal-panel` 断言 → 标签页容器契约；6 页面流程改为标签导航流程 | `tests/ui/` |
| B2.7 | **Chrome 基线交互补齐**：`findInPage` 查找条；缩放按 normalized origin 记忆；DownloadManager 将普通下载写入受控下载目录，净化文件名、防目录穿越、处理重名并用 NoticeBar 反馈，`.user.js` 导航进入安装确认页；页面右键菜单见 **B2.8** | `TabManager`、`shortcuts/`、`downloads/`、`browser:findInPage`/`browser:setZoom` |
| B2.8 | **右键菜单体系（用户点名重点，一等交付物）**。统一走原生 `Menu.popup`（§4 三分法，零遮挡零延迟），一个 `contextMenus/` 模块集中定义全部菜单模板，杜绝散落。**① OJ 页面右键**（webContents `context-menu` 事件，params 提供 linkURL/srcURL/mediaType/selectionText/isEditable/editFlags，按上下文动态组装）：链接上=新标签页打开/复制链接地址（B3 起加"在新窗口打开"）；图片上=新标签页打开图片/复制图片/复制图片地址/图片另存为（走 B2.7 下载）；选中文本=复制/"使用 <搜索引擎> 搜索'…'"（联动 B2.5 omnibox 搜索引擎，新标签打开）；可编辑区=剪切/复制/粘贴/全选/撤销/重做（按 editFlags 动态置灰）；空白处=返回/前进/重新加载（置灰态跟随导航状态）。**② 标签右键**（Chrome 全集）：重新加载、复制标签页（duplicate）、移到新窗口（B3 启用）、关闭、关闭其他标签页、关闭右侧标签页、恢复关闭的标签页、复制网址。**③ 壳内编辑区右键**（笔记编辑器/设置输入框/omnibox 等 React 区域，壳 webContents 同一 handler）：剪切/复制/粘贴/全选；omnibox 额外提供 **"粘贴并前往"**（Chrome 特色）。**④ 内部页空白右键**：返回/刷新。**后续挂点**：B3 拆分入口（移到新窗口）、B6 脚本命令子菜单（与三点菜单双入口）。侧栏题目行右键（打开/新标签打开/详情/笔记）为可选加分项 | 新 `electron/contextMenus/`、`TabManager`、`TabStrip`、`Omnibox` |

验收：所有功能入口不再弹浮窗；设置/看板等以标签打开且可 Ctrl+W 关闭；omnibox 搜索与历史补全可用；查找/缩放/下载可用；**右键菜单专项验收——OJ 页面五种上下文（链接/图片/选中文本/编辑区/空白）分组正确、编辑区按 editFlags 正确置灰、选中文本可一键搜索、标签右键八项全可用、omnibox"粘贴并前往"可用、任何右键菜单不被 WebContentsView 遮挡**；截图替身代码与退役通道全删；`test:all` 绿。

### B3 多窗口对等壳与拆分（预计 15-21 小时）

⚠️ 任务序强约束：**B3.2 的服务语义（尤其 ContestGuard 多 TabManager 聚合、TrackingService 多订阅护栏）必须先于或与 B3.3 同 commit 落地**——否则多壳窗口会在服务语义就绪前上线，出现比赛硬闸空窗或单状态机互踩（ContestGuard `handleUrlChange` 是单流状态机，两窗口混流喂 URL 会互相清状态）。该前置条件已满足，B3.3 拆分入口现已开放；剩余服务广播与全窗口会话快照继续由 B3.4/B3.5 收尾。

| 任务 | 内容 | 涉及 |
|---|---|---|
| B3.1 | `WindowManager`/`AppWindow` 抽象 + IPC sender 路由化：WindowManager 持有 `Map<windowId, AppWindow>`，应用级 ViewRegistry 持有 `webContentsId -> windowId/tabId/view`；盘点全部 `getWindow`/`getParentWindow`/`getTabManager` 消费者，handler 必须经中央 trusted-shell 注册器从 sender 归属表解析窗口，禁止各 handler 自行猜测；事件推送各窗口发给自己；窗口 bounds/maximized 持久化 + 多显示器越界校验。本任务保持单窗口行为不变，可完整回归后再继续 | 新 `electron/windows/`、全部 IPC 注册器、`main.ts`、`windowBounds.ts` |
| B3.2 | 事件源 per-webContents 化：统一导航契约为 `{windowId, tabId, webContentsId, url, isMainFrame, reason}`，iframe 导航不得覆盖标签顶层 URL；did-navigate/dom-ready/page-title-updated/did-finish-load 直达消费者，一次修复访问追踪、标题、脚本、实时提交与 Coach 五条链路；ContestGuard 按 webContents 聚合并在销毁时清理；TrackingService 按 visitId 多流并行关闭；Coach 保守单会话跟随最近活跃窗口并防抖；tracking 写路径收进 repository，`deleteProblem` 包事务并重算涉及日期；所有链路接落盘诊断 | `TabManager`、`tracking/`、`scripts/`、`submissions/`、`coach/` |
| B3.3 | 拆分窗口 = 新建完整壳窗口 + `releaseTab`/`adoptTab` 过户；恢复标签拖出、右键"移到新窗口"、双击三种入口并支持拖回合并；传输过程使用 tab 锁，顺序固定为旧父摘除→旧 owner 释放→注册表换主→新 owner 接纳→新父挂载，任一步失败回滚；窗口 close 与拖拽竞态不得产生无主、重复挂载或已销毁 view；移出最后一个标签后源窗口自动关闭；删除 `DetachedWindow` + 退役 `tab:detach` 通道 | `windows/`、`TabManager`、`TabStrip` |
| B3.4 | 剩余服务多窗口化：`problems:updated` 广播全窗口；SessionTracker 聚焦判定改"任一本 app 窗口"；syncService 按窗口活跃 tab；（已定 D7）比赛模式横幅接 `coach:contestModeChanged` | `submissions/`、`coach/`、`tracking/` |
| B3.5 | 生命周期浏览器化：任一窗口可关（含最初主窗口）；关闭窗口显式销毁其仍拥有的 tabs，已迁出 tabs 不受影响；最后壳窗口关闭即退出，桌宠不维持进程且默认跟随最近活跃壳窗口；second-instance 聚焦最近活跃窗口；窗口/标签快照原子落盘，重启恢复全部窗口、激活项与合法 bounds；`startupSmoke`、ipcContracts 与泄漏测试同步更新 | `main.ts`、`app/startupSmoke.ts`、tests |

验收：拆出窗口有完整标签栏/工具栏/内部页能力；**拆分入口三种方式（拖出/右键/双击）全部可用——B0 的临时禁用在此正式解除**；原窗口关闭后拆分窗口一切功能正常（提交监测/追踪/脚本注入/比赛静默不降级）；两窗口分别处于比赛页/非比赛页时比赛模式判定正确（聚合不互踩）；从拆分窗口发起导入/导出对话框父窗口正确；标签可拖回；无 webContents 泄漏（关窗后进程数正确）；`test:all` 绿。

### B4 账户与密码管理（预计 14-18 小时）

> 安全前置：B0 的 app 协议/CSP/IPC sender 校验与 B6.1-B6.4 的用户脚本/网络边界已经完成。由于迁移版本固定为 B4.1=026、B6.1=027，B4.1 仍作为唯一数据地基前置例外；B4.2 Vault、B4.3 自动填充、B4.4 账户中心和 B4.5 登录捕获已在前置闭合后完成，下一步只剩 B4.6 打包层加固。

| 任务 | 内容 | 涉及 |
|---|---|---|
| B4.1 | migration **026_site_credentials**：id/site_id/username/secret_envelope/last_used_at/sync_excluded=1/时间戳（北京时间）/deleted_at，UNIQUE(site_id,username)；加密 envelope 显式带版本；repository 三件套；加入导出排除清单并如实列全未导出表；导出入口标注"完整备份请用数据库备份"；不变量测试覆盖密文、导出、软删和 migration 失败恢复 | `db/migrations/`、`db/repositories/credential/`、`backup/learningDataExport` |
| B4.2 | `CredentialVault` 按 DI 拆分：save/list/delete/getForAutofill；使用 `safeStorage.encryptStringAsync/decryptStringAsync`，支持 isEncryptionAvailable、key rotation/旧 envelope 重加密和结构化错误码；系统密钥环自动解锁，无应用主密码、无明文回退；壳 renderer 只见 credentialId/username/masked，OJ 隔离 preload 到主进程的受限内部通道是唯一允许传输登录明文的 IPC | 新 `electron/credentials/`、`registerCredentialsIpc`、`tests/security/` |
| B4.3 | 登录自动填充：**站点配置收敛为 DB site_configs 唯一源**（体检定性：SiteRegistry 创建即丢弃、cookiePolicy 全链零消费——"双源"实为"一源已死"；seed 补全写入 cookie_policy/patterns/adapter/login selectors 后删除旧内存配置）；**监听挂点不走 TabManager 回调**——改挂 `app.on('web-contents-created')` 过滤 `persist:oj-main`，天然覆盖所有窗口；**只填充不自动提交**；填充前严格校验 HTTPS、域名和登录 URL。已完成 migration 028、七站初始 selector seed、OJ 隔离 preload 通道、SPA/reload stale guard 和定向测试；真实七站逐站登录页 smoke 留作后续环境验收，不在本任务中虚报 | `db/repositories/site`、`credentials/autofill` |
| B4.4 | 设置内"账户"分区（内部页标签体系内）：整合登录态摘要 + 保存凭据列表（脱敏显示、删除、重命名、前往登录页更新密码）+ rating handle 绑定；不在壳 renderer 提供密码明文查看/编辑框；多凭据选择填充使用顶部 NoticeBar；顺手清理 mainServices 里创建即丢弃的 SiteRegistry/CookieVault 实例语句 | `src/features/settings/`、`app/mainServices.ts` |
| B4.5 | `[x]` **登录捕获（Chrome 主路径）**：ojPreload 隔离世界监听登录表单 submit，仅把 username/password 直接送入主进程短时内存；主进程向壳发送不含密码的 captureId + 脱敏摘要，NoticeBar 确认后入 Vault，取消/超时/导航/销毁/dispose 立即清空；已存在同名凭据且密码变化时提示更新，同密码静默忽略；自动填充只填不提交 | `ojPreload`、`credentials/`、NoticeBar |
| B4.6 | `[ ]` **打包层加固**：直接使用 electron-builder `electronFuses` 配置：runAsNode=false、enableCookieEncryption=true、enableNodeOptionsEnvironmentVariable=false、enableNodeCliInspectArguments=false、enableEmbeddedAsarIntegrityValidation=true、onlyLoadAppFromAsar=true、grantFileProtocolExtraPrivileges=false；smoke preload 仅 STARTUP_SMOKE_MODE 可启用；生产 DevTools 禁用；打包测试读取 fuse 状态并验证 asarUnpack/native SQLite 兼容 | `electron-builder.json5`、`main.ts`、packaged tests |

验收：在 OJ 登录一次 → 通知条提示保存 → 重开登录页自动填好、点登录即可（拆分窗口内同样生效）；密码在 DB 中为密文、导出不含、日志无泄漏；safeStorage 不可用时保存被拒绝且有提示；打包产物 cookie 落盘加密、无法以 --inspect 附加；`test:security` 与 `test:packaged-app` 绿。

### B5 视觉收尾与打磨（预计 10-14 小时）

> **视觉冻结约束**：本阶段不是第二轮改版。所有布局、状态和动效补全必须复用 `0a1a1c4` 已确定的 token、字体、色彩、圆角、阴影、组件和图标；禁止重新换主题、重画组件或扩大视觉 diff。允许的变化仅限浏览器化结构必需调整、暗色模式、无障碍、响应式缺陷与明确视觉 bug。

| 任务 | 内容 |
|---|---|
| B5.1 | 设置页 Chrome 式改版：左侧分区导航 + 全页布局（参照 chrome://settings），拆掉 9 面板双列堆叠 |
| B5.2 | Dashboard/首页/题库侧栏 token 化打磨：间距/层级/空态/加载态统一；侧栏折叠加过渡动画 |
| B5.3 | 全局动效：内部页切换 View Transitions、标签动效细节、Dialog/侧板出入场、hover/focus 状态完备 |
| B5.4 | （已定 D6）暗色模式切换落地：token 双值已在 B1.1 预留，本任务实现明暗切换（进度紧张可裁剪至后续小版本，token 层保证补作成本低） |
| B5.5 | **桌宠置顶策略（必做，G1 分层诊断项）**：跟随主窗口置顶/全局置顶/停靠 三模式可配，解除 alwaysOnTop 盖住应用内一切的问题；窗口尺寸与内部元素按 scale 解耦（可选） |
| B5.6 | （已定 D14）开启 Crepe Latex 特性（让已打包的 1MB KaTeX 字体产生价值）；文档同步矩阵收尾核对（见 §9；ADR_0004 已在 B3 落地并登记索引，此处仅核对），DATABASE_SCHEMA.md 给 study_sessions/sync_queue 等预留未启用表加标注 |

验收：三视口 Playwright 截图基线全部更新并通过；`test:all` 绿；人工验收清单（拆分/账户/快捷键/动效）通过。

### B6 用户脚本引擎油猴化（预计 24-34 小时）

> 前置：B2.2（脚本管理页与安装确认页是内部页标签）、B3.2（per-webContents 注入挂点）；可与 B4/B5 并行。设计输入：Tampermonkey/Violentmonkey 官方规范与 VM 源码 + Greasy Fork 21 个热门竞赛脚本画像（§2.8）。用户痛点"无法更新"已由 B0.11 先行止血，本阶段交付完整油猴生态兼容。

| 任务 | 内容 | 涉及 |
|---|---|---|
| B6.1 | migration **027_userscript_runtime**；metadata 扩至 @namespace/@grant/@exclude(-match)/@connect/@noframes/@updateURL/@downloadURL/@antifeature/@icon 等；新表覆盖 values、资源缓存、host 授权与 update state；@match 严格按 scheme/host/path 解析并锚定 host、忽略 query/hash，@include 支持 glob/regex，exclude 最高优先，site_ids 显式绑定覆盖脚本规则 | `userScriptMetadata`、`UserScriptService`、`db/migrations/` |
| B6.2 | GM 运行时重写：脚本以 IIFE 执行，GM API 仅作局部参数，不挂 `window.GM_*`；session 注册一个固定 userscript bootstrap preload，它从主进程内存缓存取得当前 frame 的匹配脚本和值快照；主世界脚本通过每次导航生成的私有 MessagePort 与隔离 preload 通信，桥不暴露给站点；shell renderer 永远不接收可执行源码 | `userscriptBootstrapPreload`、`userScriptMainWorldRuntime`、受限 GM 桥 |
| B6.3 | GM_xmlhttpRequest 主进程代理 + @connect 白名单：初始与重定向 URL 双校验，未授权域首次请求由所属窗口 NoticeBar 授权并按脚本持久化；响应补齐 finalUrl/headers/status/timeout/responseType；本任务前半段作为 B4 安全前置，完成后删除 `ojSession` 的全局 CORS 响应头改写；GM_setClipboard、GM_registerMenuCommand、window.onurlchange 同批接入 | 新 `scripts/gmProxy`、`contextMenus/`、NoticeBar |
| B6.4 | 注入调度重写：使用 `session.registerPreloadScript({ type:'frame' })` 让 bootstrap 早于普通 ojPreload；document-start 必须以真实页面内联脚本顺序测试证明，document-end=DOMContentLoaded，document-idle=did-finish-load；覆盖后台标签、iframe、noframes、SPA、脚本更新/注销竞态与 stale-version guard；若目标 Electron 版本无法通过顺序测试，明确标记为 best-effort，禁止声称精确兼容 | `ojSession`、`userscriptBootstrapPreload`、调度器 |
| B6.5 | @require/@resource 改为安装/更新时下载入库 + **SRI 校验**（URL #sha256/md5，多 hash 取最后受支持项——现状"解析时剥离丢弃"是安全缺陷）；注入时 @require 按序拼接在用户代码前同段执行（免站点 CSP、保证顺序）；GM_getResourceText 回缓存文本、GM_getResourceURL 回 data:/blob: | `scripts/installer`、资源缓存 |
| B6.6 | 安装与更新链路：拦截 `.user.js` 后先下载、解析、校验、缓存资源，再用数据库事务 + 临时文件原子替换，任一步失败保留旧版；确认页展示身份、版本、匹配域、grant/connect、antifeature 与版本 diff；更新链按 updateURL/downloadURL/lastInstallURL 回退，默认每 24h + 手动检查，使用 ETag/Last-Modified | `scripts/updater`、`scripts/installer`、TabManager 导航拦截 |
| B6.7 | 管理页升级与安全收口：代码只读查看 + 系统编辑器打开 + watcher；重复导入提供更新现有/另存本地副本/取消，本地副本使用独立 namespace；启停、更新、删除必须同步刷新主进程缓存并注销旧版本；脚本源码不进日志，OJ bootstrap 之外的 renderer 不接收源码；提交桥加每导航随机 token | `src/features/scripts/`、`ojPreload`、`tests/` |

明确不做/降级（写入脚本页说明，画像中使用率各 ≤1 或 0）：GM_webRequest、GM_cookie、GM_getTab 族、GM_download（降级为主进程 dialog 下载）、@sandbox DOM 隔离世界（首版全部主世界=TM raw 默认；Electron executeJavaScript 不受站点 CSP 限制）、脚本云同步。

验收：Greasy Fork 脚本页点"安装此脚本"→ 应用内确认页 → 安装成功；重复安装同脚本=覆盖更新且保留启停/站点配置；"检查更新"能把旧版 Codeforces Better! 升到新版；画像 Top 脚本实测可用清单 ≥5 个（Codeforces Better!/CF-Predictor/LeetCodeRating 等，覆盖 GM_xmlhttpRequest/@connect/GM_addStyle/GM 值/document-start 各路径）；GM 值持久且站点 JS 无法读取；@connect 未授权域请求被拦截并弹授权；后台标签与 iframe 注入生效；`test:all` 绿。

### 预计总量

查缺补漏后的净协作编码时长约 **115-165 小时**；按每天 4-6 小时协作节奏约 **5-8 周**。每个任务开工时仍需给出单项预计用时。强制顺序为：B0 安全/数据地基 → B1 补齐与 B2 标签壳 → B3 多窗口 → B6.1-B6.4 网络与早注入边界 → B4 凭据 → B6 剩余兼容与 B5 收尾。唯一顺序例外是先落 B4.1 的 migration 026 数据地基，以保持迁移版本 026→027 单调递增；B4.2-B4.6 不得提前启用。B4.5 不得先于 B6.3 的全局 CORS 清除上线。

---

## 6. 不可破坏的红线（重构全程守卫）

1. **WebContentsView 唯一方案**（ADR-0001），禁止 BrowserView/webview/iframe 承载 OJ 页面；架构守卫脚本 5 条规则全程有效（禁 BrowserView、src 禁 `ipcRenderer` 字样、preload 禁通用 IPC、Nowcoder/VJudge 实时链路锁定）。
2. **OJ 会话链不可破坏**：`persist:oj-main` 分区、ojPreload、stealth 注入、session 级早注入随任何新窗口/新标签路径完整保留；拆分/过户必须移交同一 WebContentsView 实例（登录态与页面状态无损，已实测）。
3. **Coach 比赛模式硬闸**：主进程 hard gate 不可绕过、审计可导出；多窗口语义取保守方向；`CoachOrchestrator` 单一 LLM 请求门不得拆分（安全守卫钉死）。
4. **凭据安全对齐 Cookie 规则**：密码明文只允许存在于用户正在输入的 OJ 页面、OJ 隔离 preload 到主进程的专用内部 IPC 和主进程瞬时内存；壳 renderer 永远只见脱敏值；不写日志、不进导出、不进 sync；safeStorage 不可用即拒绝持久化、无明文回退。
5. **实时提交 fail-closed**：senderUrl-adapter 一致性校验只加强（增加窗口注册表归属校验）不放松；写库路径保持 sender 无关。
6. **CI 门槛不回退**：覆盖率 28/34/24/29 与 entry 上限保持现值（调整门槛不作为首选项）；懒加载 chunk 边界与文件名变更必须与门槛脚本同 commit；`eslint --max-warnings 0` 与 typecheck 全程绿。
7. **IPC 纪律**：新增 channel 五处同步（handler/preload/类型声明/feature Api/ipc README）+ 契约测试清单；普通 IPC 必须使用 trusted-shell 注册器并验证 sender/senderFrame/origin/窗口归属；OJ 内部通道必须使用各自的 fail-closed validator；preload 保持扁平字面量格式。
8. **文档守卫**：新目录必须五要素 README 并登记 `docs/README.md` 索引；schema 变更同步 DATABASE_SCHEMA；北京时间（本地时间）入库；中文 commit；直接在主目录修改文件。
9. **用户脚本安全边界（B6 起生效）**：GM API 严格按 @grant 白名单裁剪注入，不挂 window.GM_*；GM_xmlhttpRequest 仅经主进程代理且受 @connect 白名单 + 用户授权双闸，绝不给页面世界无白名单的自由跨域代理；@require/@resource 必须 SRI 校验 + 本地缓存；脚本源码不进日志，renderer 仅经受控只读通道查看（升级为测试守卫）。
10. **前端视觉冻结**：`0a1a1c4` 是后续重构的视觉基线。除暗色模式、无障碍、响应式缺陷和明确 bug 外，禁止更换色板、字体、圆角、阴影、组件外观、图标体系与动效基调；浏览器化只调整信息架构、布局占位和交互，不另起视觉方案。每次涉及 TSX/CSS 的任务必须附视觉 diff 说明，若无计划内视觉变化应明确记录“视觉无变更”。

---

## 7. 决策点

### 7.1 已确认决策（2026-08-16 用户拍板）

| # | 决策 | 结论 |
|---|---|---|
| D1 | 组件测试基建 | **引入 jsdom + @testing-library**（B0.6 落地，单独 commit 验证打包链兼容） |
| D2 | 笔记形态 | **内部页标签**（problem-notes?id=x，与题目详情同形态，B2.2 落地）；不做右侧 Side Panel |
| D12 | B0→B3 拆分能力空窗处置 | **B0 起临时禁用双击拆出**（现有拆出本就丢失追踪/脚本注入/比赛守卫，属半残功能，禁用即消除合规空窗）。**恢复承诺——拆分不是砍掉而是暂缓：B3.3 必须以 拖出手势 + 右键"移到新窗口" + 恢复双击 三种入口重新交付完整拆分能力，此承诺已写入 B0.4 任务文字、B3.3 任务与 B3 验收清单，禁用期间 UI 提示"拆分窗口将在多窗口版本回归"** |

### 7.2 已确认决策（第二批，2026-08-16 用户拍板——全部采用推荐方案）

| # | 决策 | 结论 |
|---|---|---|
| D3 | ContestGuard 多窗口语义 | **任一窗口任一标签处于比赛页 → 全局静默**（保守合规，接受"一窗打比赛全局禁 Coach"；B0.4 单窗口聚合已按此实现，B3.2 扩展数据源） |
| D4 | 多窗口并行做题的访问统计 | **按窗口并行记录 visit**（时长口径改为多流并行，当日 duration 语义在 B3.2 用测试钉住） |
| D5 | 多账号 | **V1 只做多组凭据保存 + 手动选择填充**；per-account session 并行登录不做（牵动全链路分区参数化，将来独立立项） |
| D6 | 暗色模式 | **B1.1 预留 token 双值，B5.4 实现切换**（进度紧张可裁剪，token 层先行保证后补成本低） |
| D7 | 半接线通道处置 | **`coach:contestModeChanged` 接上壳内比赛模式横幅（B3.4）；`submissions:detected`/`problem:detected` 死发送通道删除（B0.7，三处发送点与 ipcContracts internalChannels 清单同 commit 清理）** |
| D8 | MAX_TABS | **提升至 16 并加满额提示**（实测后台标签成本≈Chrome 后台标签，内存为主；B0.3 落地） |
| D9 | 状态库 | **不引入 Zustand**（实际从未安装；维持 React state + feature hooks，符合 PROJECT_RULES 现文；同步修正记忆/文档中的失实描述） |
| D10 | 动效库 | **不引入**（CSS token + View Transitions 已实测可用）；后续需要手势/复杂编排再评估懒加载引入 motion |
| D11 | Ctrl+W 关最后一个标签 | **Chrome 语义分阶段**：B0-B2 单窗口期=最后标签重置为新标签页（首页）；B3 起=关闭该窗口，最后一个壳窗口按退出规则处理 |
| D13 | 多窗口 Coach 会话语义 | **保守单会话**：跟随"最近活跃窗口的活跃题"，切换防抖；写入 B3.2 验收（按窗口并行多会话数据模型改动大，不采用） |
| D14 | 笔记数学公式 | **开启 Crepe Latex 特性**（算法笔记对公式有真实价值，让已打包的 1MB KaTeX 字体值回票价；B5.6 落地） |

### 7.3 查缺补漏后新增决策（2026-08-16，已确认）

| # | 决策 | 结论 |
|---|---|---|
| D15 | 交付形式 | 直接将调研补充写回本计划，后续按文档实施并维护状态台账 |
| D16 | 生产远程导航 | 仅 HTTPS；开发/测试额外放行 localhost HTTP |
| D17 | 默认主页 | 新标签与无恢复会话始终为内部 home；旧 defaultHomeUrl 迁移为主页快捷入口并删除原配置链路 |
| D18 | 弹窗策略 | 安全 HTTP(S) 弹窗接管为新标签；about:blank、POST、OAuth 通过 createWindow 保留语义；无法接管则拒绝并通知 |
| D19 | 壳加载协议 | 新增 `app://shell` 自定义协议；`algo://` 只作为受控内部页地址标识 |
| D20 | 凭据解锁 | 使用系统密钥环自动解锁，不增加应用主密码 |
| D21 | document-start | 使用 `session.registerPreloadScript` 固定 bootstrap + 主进程准备脚本包；顺序必须用真实页面内联脚本测试证明 |
| D22 | @connect | 首次请求未授权域时由所属窗口 NoticeBar 授权并持久化 |
| D23 | 下载 | 普通下载进入受控应用目录，路径净化、重名处理和结果通知统一由 DownloadManager 负责 |
| D24 | migration | pending migration 前自动备份；失败自动恢复并阻止同版本无限重试 |
| D25 | 外部协议 | HTTP(S) 站外链接进入受管标签；mailto/tel/未知协议不自动唤起系统，只在显式菜单操作后尝试 |
| D26 | 自动填充 | 只填充、不自动提交；验证码和提交动作始终交给用户 |
| D27 | 最后窗口 | 最后一个完整壳窗口关闭即退出；桌宠不阻止退出 |
| D28 | 会话恢复 | 恢复上次全部合法窗口/标签；没有可恢复快照时进入内部 home |
| D29 | 脚本更新 | 默认每 24 小时 + 手动检查，使用 ETag/Last-Modified |
| D30 | 桌宠归属 | 默认跟随最近活跃壳窗口，可切换全局置顶或停靠 |

后续新决策点必须追加到本节，不得只存在聊天记录中。

---

## 8. 风险与回退

| 风险 | 缓解 |
|---|---|
| 覆盖率红灯（最大排期风险，functions 余量仅 14 函数） | 测试与 UI 同 PR；electron 绑定新模块强制 DI 拆分 + test-double 基建（§5 覆盖率纪律）；每 PR 本地跑 `npm run test:coverage`（约 2 分钟） |
| B0→B3 期间拆出窗口比赛守卫失守（合规空窗） | 已定 D12：B0 起临时禁用双击拆出，合规空窗消除；B3.3 以三种入口恢复拆分能力（恢复承诺见 §7.1） |
| 新建浮层被活动 view 遮挡（截图替身删除后的结构风险） | §4 三分法强制归类：菜单=原生 Menu.popup、持久浮层=布局让位、omnibox=摘 view 全区面板；B1/B2 验收含"web 标签激活时无 DOM 浮层伸入 view 区域"检查 |
| Playwright 全量重写与截图基线漂移 | B0 先迁 data-testid；B2.6 按页面拆 spec；基线更新单独 commit 便于 review |
| 多窗口重构引入回归 | B3.1 "sender 路由化但单窗口行为不变"作为独立可回归的中间态；B3.2 服务语义先于 B3.3 拆分入口；每任务独立 commit 可 revert |
| 过户遗留边界（双显示器混合 DPI、合成器单帧闪烁、DevTools 打开时过户） | B3.3 实现时补三个小验证（spike 已列清单）；DPI 差异过户后重设 bounds+zoom |
| SPA 站点（洛谷/LeetCode）hook 重注、VJudge iframe 链路在拆分窗口的实测 | B3.2 完成后 `npm run dev` 实测两类站点提交并核对 `realtimeSubmission:getStatus` 诊断 |
| 自动填充触发站点反自动化 | 只填充不提交；dom-ready 单次注入；URL 严格匹配；逐站实测选择器（B4.3 含七站验证清单） |
| 长后台标签 intensive throttling（>5min 定时器降至 1/min） | 依赖持续计时的逻辑全部留在主进程（现状已如此），renderer 不做后台计时 |
| jsdom/@testing-library 与打包链兼容 | 已作为 devDependencies 落地且组件测试通过；后续仅需在打包变更时继续验证其不进入产物 files 白名单 |
| 热门油猴脚本实测不兼容（用到未实现 API/时机） | 21 脚本画像先行圈定最小子集（§2.8）；B6 验收用真实 Top 脚本清单实测；不做/降级清单在脚本页透明公示；GM_info.scriptHandler 提供兼容字段 |
| 后台标签放开脚本注入的性能与 OJ 反作弊面（重脚本 700KB 级） | 默认与油猴一致（全部匹配标签注入），提供脚本级"仅活动标签"开关兜底；GM API 不挂 window.* 降低被站点探测面 |

回退策略：每阶段合入 master 前全量 `test:all`；阶段内任务粒度 commit，可单点 revert；B2 删除截图替身前先落标签化替代路径并验证，不出现功能真空期。

---

## 9. 文档同步矩阵

| 时机 | 文档 |
|---|---|
| B0 | `electron/ipc/README.md`（补 registerCoachIpc 滞后 + 快捷键说明）、新目录 README、ipcContracts 事件清单（ui:command） |
| B2 | `SYSTEM_ARCHITECTURE.md`（标签/内部页模型）、`src/features/README.md`（废除"弹层走 ModalLayer"规则，改为 §4 浮层三分法）、`electron/browser/README.md`、`tests/ui/README.md`、ipcContracts coreContracts（退役通道删项） |
| B3 | `SYSTEM_ARCHITECTURE.md`（多窗口模型）、**新增 `ADR_0004_MULTI_WINDOW_SHELL.md` 并登记 docs/README.md 索引**、`AI_COACH_ARCHITECTURE.md`（比赛守卫多窗口语义）、`electron/windows/README.md`、ipcContracts 事件清单（window:listChanged、tab:detach 退役） |
| B4 | `DATABASE_SCHEMA.md`（site_credentials）、`SECURITY.md`（密码边界）、`electron/credentials/README.md`、`SITE_ADAPTER_GUIDE.md`（loginUrlPatterns） |
| B6 | `electron/scripts/README.md` 重写（油猴兼容面/不做清单/安全边界）、`DATABASE_SCHEMA.md`（user_scripts 增列 + user_script_values）、`SECURITY.md`（@connect 模型与脚本边界）、`electron/ipc/README.md`（scripts:* 新通道）、ipcContracts |
| B5 | `docs/README.md` 索引核对、`PRODUCT/CHANGELOG.md`、TASKS 编排文档 |
| 全程 | 每阶段完成更新 `algo-electron/docs/TASKS.md`（或新建重构专属任务清单，待用户定） |

---

## 10. 验证入口汇总

- 快速自检：`npm run test:coverage`、`npm run test:performance`、`npm run test:architecture`、`npm run test:security`
- UI 验收：`npm run test:ui`（Playwright 三视口截图）
- 全量（CI 等价）：`npm run test:all`
- Electron 集成专项：伪造 shell IPC/iframe sender/未知 webContents 拒绝；GET/POST/about:blank/OAuth 弹窗接管；permission request/check 双路径拒绝；窗口过户/关闭竞态；render-process-gone/unresponsive；会话恢复；document-start 顺序。
- 打包专项：读取 fuse 状态；验证 RunAsNode/inspect 被禁、CookieEncryption、ASAR-only、自定义 app 协议、生产 CSP、生产 DevTools 禁用和 better-sqlite3 asarUnpack。
- 人工验收清单：双显示器混合 DPI；拆出窗口后关闭原窗口仍保持提交监测/追踪/脚本/比赛静默；比赛与非比赛窗口并存；验证码/OAuth 登录；离线、权限与下载失败；200% 缩放、键盘导航与 reduced-motion。

---

## 11. 执行状态与完成标记

### 11.1 状态规则

- `[ ] 待开始`：尚无实现提交。
- `[~] 部分完成`：已有可复用实现，但本任务验收条件未全部满足。
- `[x] 已完成`：代码、自动测试、文档、人工验收和状态记录全部完成。
- `[!] 阻塞`：存在外部依赖或已连续验证无法推进；必须写明阻塞原因、证据和解除条件。
- 不允许仅因“代码写完”标记 `[x]`。每项完成时必须在本表填写 commit、验证命令、人工验收结果和北京时间日期。
- 涉及 TSX/CSS 时必须填写视觉影响：`无视觉变更` 或列出计划允许的视觉变化；未说明不得合入。

### 11.2 Definition of Done

1. 任务对应实现完整，旧路径/旧通道按计划删除或保留兼容说明。
2. 单元、Electron 集成、UI、架构、安全、性能、打包测试按任务风险运行并通过。
3. IPC、schema、README、ADR、SECURITY 等受影响文档同 commit 更新。
4. 人工验收覆盖任务表中的主要成功路径、失败路径和多窗口路径。
5. `git diff` 不包含任务外重构；前端视觉遵守 `0a1a1c4` 冻结基线。
6. 状态表从 `[ ]/[~]` 更新为 `[x]`，填写证据后才算完成。

### 11.3 总任务台账

| 任务 | 状态 | 当前证据/剩余工作 |
|---|---|---|
| PLAN-R1 | [x] | 2026-08-16：完成联网调研、查缺补漏、决策 D15-D30、迁移编号修正、安全与验收补充 |
| B0.1 | [x] | `fe31338`（2026-08-16）：壳与每个 OJ WebContentsView 共用纯快捷键分发器；显式空原生菜单消除 default_app Ctrl+W 关窗；接入 Ctrl/Cmd+T/W/Tab/Shift+Tab/1-8/L、F5/R、缩放、Alt 历史导航和 DevTools；新增 `ui:command` 地址栏聚焦通道；测试替身、IPC 合约、文档和 Playwright harness 已同步；全量验证通过；无视觉变更 |
| B0.2 | [x] | `75c8e28`（2026-08-17）：`setWindowOpenHandler({ createWindow })` 原样接管 Chromium 提供的 popup `webContents` 为受管标签，保留 about:blank、GET、POST、OAuth opener/postMessage 与前后台标签语义；销毁回调固定捕获 webContents，覆盖关闭竞态；生产仅允许 HTTPS，开发/smoke 仅额外放行 localhost/127.0.0.1/[::1] HTTP，未知协议拒绝并通过 `ui:command` 通知；默认与 `persist:oj-main` session 同时安装 permission check/request 双处理器，敏感权限默认拒绝；README、test-double、browser 单测和真实 Electron smoke 已同步。验证：`npm run typecheck`、`npm run lint`、`npm run test:coverage`（43 files/345 tests，31.95/36.48/27.28/32.85%）、`npm run test:architecture`、`npm run test:security`、`npm run test:docs`、`npm run test:performance`、`npm run test:electron`、`npm run test:ui`、`npm run test:all` 全部通过；人工验收覆盖安全协议提示、权限拒绝、about:blank、GET、POST、OAuth 与 popup 关闭恢复。视觉影响：无视觉变更（仅复用既有工具栏消息区域）` |
| B0.3 | [x] | `95907e9`（2026-08-17）：标签上限由 8 提升至 16，直接创建与 popup 满额均拒绝并通过既有消息区提示；TabBar 支持中键关闭；关闭活动标签优先激活右邻，无右邻时回退左邻；关闭栈按 LIFO 保存 URL+标题并通过 `Ctrl/Cmd+Shift+T` / `tab:reopenClosed` 恢复；关闭最后一个标签会重置为空白新标签，保留 B3 改为关窗的演进边界；IPC、preload、快捷键、README、Playwright harness 和 jsdom/test-double 测试已同步。验证：`npm run typecheck`、`npm run lint`、`npm run test:coverage`（45 files/350 tests，32.71/36.99/27.95/33.63%）、`npm run test:architecture`、`npm run test:security`、`npm run test:docs`、`npm run test:performance`、`npm run test:electron`、`npm run test:ui`、`npm run test:all` 全部通过；人工验收覆盖中键、关闭右邻、最后标签、恢复顺序和满额直接/popup 两条路径。视觉影响：无视觉变更（未修改 CSS，仅复用既有消息区域） |
| B0.4 | [x] | `ed161d9`（2026-08-17）：新增独立 `ContestUrlAggregator`，按裸 `webContents.id` 聚合 URL 快照，稳定保留最早进入的比赛 view，任一同标签/后台标签处于 CF、Gym 或洛谷比赛页即维持全局静默，最后一个比赛 view 导航离开或销毁后恢复；`TabManager.createView` 直接在 `did-navigate`/`did-navigate-in-page` 与 `destroyed` 上发布快照，订阅时回放现存集合，不经过 `findTabByView`、活动标签门控、`setNavigateCallback` 或 `addNavigateListener`，题目标题与实时提交追踪挂点保持不变；`CoachOrchestrator` 严格 4 增/4 删，仅注入安装 helper；旧 TabBar 双击拆分入口临时下线，复用现有工具栏消息区提示“拆分窗口将在多窗口版本以更完整形态回归”，未调用 detach API。验证：`npm run typecheck`、`npm run lint`、针对性 7 files/43 tests、`npm run test:docs`、`npm run test:all` 全部通过；全量为 46 files/354 tests，覆盖率 33.23/37.23/28.72/34.19%，真实 Electron smoke 与 Playwright 1280x800、1024x720、800x600 均通过。交互验收覆盖订阅回放、同标签进出比赛、后台标签进比赛、销毁最后比赛 view、双击提示和 detach 零调用；视觉影响：无样式文件变更，仅复用既有消息区域；B3.3 仍保留完整拆分恢复承诺 |
| B0.5 | [x] | `019eaab`（2026-08-17）：新增纯 `electron/browser/browserLayout.ts` 作为唯一布局契约，`toolbarHeight=42`、`tabBarHeight=36`、`topOffset=78` 只定义一次；TabManager bounds、兼容 BrowserHost、ModalLayer 与 `app-shell.css` 全部改为消费契约/注入 CSS 变量，preload 通过 `electronAPI.browserLayout` 注入 renderer，截图 harness 同步模拟契约，未改变任何计算结果或视觉值。新增 `src/browserLayout.ts` 纯注入 helper 与 `tests/browser/browserLayout.test.ts`，覆盖派生关系和三个 CSS 变量；README 已同步。验证：`npm run typecheck`、`npm run lint`、`npm run test:docs`、`npm run test:all` 全部通过；全量为 47 files/356 tests，覆盖率 33.29/37.23/28.76/34.26%，真实 Electron smoke 与 Playwright 1280x800、1024x720、800x600 均通过；浏览器壳相关裸 42/36 常量已清零。视觉影响：无视觉变化，仅把原有固定值替换为同值契约变量 |
| B0.6 | [x] | `a466c30`（2026-08-16）：Electron test-double、Vitest alias、核心 async lint 守卫、tracking/title/userscript 诊断出口与 `browser:getDiagnostics` 已完成；`npm run typecheck`、`npm run lint`、`npm run test:coverage`（38 files/332 tests，29.68/34.85/25.17/30.48%）、`npm run test:architecture`、`npm run test:security`、`npm run test:docs` 通过；人工验收覆盖 test-double view 生命周期和诊断 skip/failure；无视觉变更 |
| B0.7 | [x] | `22c7013`（2026-08-17）：删除零运行时引用的 `BrowserHost`、`public/home.html` 与两个站点适配器转发壳，适配器测试改为直接导入真实实现；`SyncService.setBrowserHost` 收敛为 `setScrapeHost`；删除 renderer 无消费者的 `problem:detected`、`submissions:detected` 发送通道与过期 IPC wiring，同时保留 TrackingService 内部回调和 SubmissionWatcher 主进程事件语义；README、ADR、系统架构、提交监控和治理文档已同步。验证：`npm run test:all` 全部通过，47 files/357 tests，覆盖率 33.65/37.53/29.20/34.64%，真实 Electron smoke 与 Playwright 1280x800、1024x720、800x600 均通过；另执行 `npm run test:electron`、`npm run build` 和 packaged-main 检查通过，源代码扫描确认无旧运行时引用。人工验收覆盖适配器直连、同步服务命名、死 channel 合约和被保留的主进程事件链。视觉影响：无视觉变更，未修改 TSX/CSS/动画 |
| B0.8 | [x] | `81f4c08`（2026-08-17）：主进程致命异常兜底、启动失败报告、壳 renderer 自动恢复、滚动落盘日志与关键链路诊断已完成；packaged smoke 改为异步子进程，修复同步阻塞 HTTP server 导致的假失败；全量验证通过；无视觉变更 |
| B0.9 | [x] | `ddeabfa` + `ed62379`（2026-08-18）：在日志文件、privileged scheme、IPC、生命周期和数据库服务注册前获取 Electron 单实例锁；失败实例立即 `app.quit()` 且不写共享日志、不打开数据库、不创建窗口；后续启动通过 `second-instance` 恢复最小化窗口并执行 `show()`/`focus()`，缺失、已销毁或聚焦失败路径均记录诊断；Electron test-double、单元测试、真实 `win-unpacked` 双进程 smoke 和 README 已同步。验证：`npm run typecheck`、`npm run lint`、聚焦 3 files/7 tests、`npm run test:all`（53 files/370 tests，覆盖率 34.87/38.31/30.48/35.84%）、`npm run build`、`npm run test:packaged-app` 全部通过；真实双开确认失败实例快速退出、主实例继续存活并聚焦且失败实例不写共享日志；无视觉变更 |
| B0.10 | [x] | `9de6661`（2026-08-18）：统计日期条件统一改为 `>= local_day AND < next_local_day` 范围谓词；提交批次只重算本批新增提交日期及首次 AC 变化影响的旧/新日期，不再全史逐日刷新；主服务改为等待异步数据库初始化。检测 pending migration 后使用 SQLite backup API 写入 `userData/backups` 并保留最近 3 份；迁移失败关闭连接、清理 WAL/SHM、恢复迁移前备份、原子写 failure marker，同一 pending version 下次启动直接阻断并交由主进程致命错误链退出；启动时把开放的 `problem_visits` 按 `entered_at` 封闭并标记 `startup_recovery`，正常关闭改为精确 visit id 更新。验证：`npm run test:db`、`npm run test:all`（57 files/379 tests，覆盖率 35.73/38.63/31.49/36.75%）、`npm run build`、`npm run test:packaged-app` 全部通过；两年事实数据单日重算重复实测 0.33-0.90ms，低于 50ms 门槛；无视觉变更 |
| B0.11 | [x] | `e35212b`（2026-08-18）：migration 025 为用户脚本增加 namespace/identity_name/auto_update_enabled，并按活动身份把存量重复项确定性拆为 canonical + local copy；新导入按精确身份覆盖更新，支持版本关系确认、另存本地副本、legacy 原子认领和北京时间；内容寻址文件名、原子落盘、DB 失败清理、旧受管文件安全回收和源文件保护已完成；`scripts:save` 收窄为显示名/站点绑定白名单，父窗口原生对话框接线完成；无视觉变更 |
| B0.12 | [x] | `a004d3c`（2026-08-16）：生产壳迁移至 `app://shell` 并启用严格 CSP；普通 IPC 统一接入 shell sender/main-frame/origin/payload 校验，OJ 提交通道使用专用 HTTPS sender validator；TabManager 管理 OJ sender 生命周期；安全、架构、IPC 合约与真实 Electron startup smoke 覆盖已完成；全量验证通过；无视觉变更 |
| B1.1 | [x] | `efed871`（2026-08-18）：补齐 4 档 spacing、3 档语义圆角别名、3 档 easing；暗色主题同步覆盖完整 `--color-*` 语义 token 与兼容别名；静态治理测试纳入 core suite；仅 token 层变更，视觉冻结不变 |
| B1.2 | [x] | `16bae97` + `d0fc989`（2026-08-18）：补齐内部页 Dialog、DropdownMenu、Toast、NoticeBar；Dialog/ConfirmDialog 支持焦点陷阱、Esc/遮罩关闭与焦点恢复，DropdownMenu 支持方向键/Home/End/禁用项/空菜单 Esc/外点关闭，Toast 提供 live region/自动消退/操作，NoticeBar 保持文档流让位；全部基础组件默认输出可覆盖的 `data-testid`；独立 jsdom 测试与 README 已同步 |
| B1.3 | [x] | `9346856` + `20bc054`（2026-08-18）：关闭/删除按钮、时间轴五类事件、详情外链和笔记空态全部收拢到统一 Icon/IconButton；运行时功能性 Unicode 归零，内联 SVG 仅保留统一 Icon 实现与 CoachPet 领域插画；固定原容器/字号/尺寸并增加回流守卫；集中截图验收并入后续 UI 回归 |
| B1.4 | [x] | `0a1a1c4`；`rg` 确认 src 中无原生 confirm；组件测试已覆盖 ConfirmDialog |
| B1.5 | [x] | `66821d0` + `7df12ce` + `7240170`（2026-08-18）：清理零引用 `@milkdown/theme-nord`，保留 Crepe 实际 Nord CSS；Coach 原始配色、透明度、圆角与动效值集中到独立 `tokens.css`；Dashboard/Coach、首页和设置三组统计卡片真实迁移到 `Card`，治理测试防止回流；既有 feature/notes/scripts 已由 `0a1a1c4` 完成按钮/输入/确认框收编；视觉冻结不变 |
| B2.1 | [x] | `ac5fa27` + `4f8f40f` + `8db5c27` + `8c93cd7`（2026-08-18）：有序标签模型、严格安全快照、原子存储、250ms 防抖、退出 flush、稳定 ID/顺序恢复与 renderer 首次列表同步全部完成；web renderer 崩溃后保留标签元数据并摘除坏 view，可复用或替换 view 恢复原地址，失败与迟到事件不删除/污染标签；unresponsive 使用普通文档流 NoticeBar 提供继续等待、按 tabId 重载和关闭，活动 view 同步下移 38px，responsive 后自动撤销。健康态不进入会话快照。验证：`npm run typecheck`、`npm run lint`、`npm run test:core`（40 files/484 tests）、`npm run test:ui`（3 viewports）和 `git diff --check` 全部通过；按批量验证策略暂缓生产构建、NSIS 与真实 packaged smoke。正常态视觉冻结不变，仅新增复用现有 token/组件的故障状态页和通知条 |
| B2.2 | [x] | `8922c54`（2026-08-18）：完成 web/internal 混合标签、ShellRouter、内部 home、旧默认首页迁移与全部既定内部页路由归属；正常态视觉风格冻结 |
| B2.3 | [x] | `8922c54`（2026-08-18）：删除截图替身三件套和三个旧 view 通道，`goHome` 切换内部 home；NoticeBar 与 38px view bounds 让位链路完成 |
| B2.4 | [x] | `4112c01`（2026-08-18）：旧 TabBar 完整替换为 Chrome 风格 TabStrip；补齐 favicon/内部页图标、加载与崩溃状态、pointer 排序及 `tab:reorder` 持久化、横向溢出与边缘自动滚动、新建/关闭动效、reduced motion、中键关闭、活动标签自动滚入、ARIA 方向键/Home/End 导航；标签区保持 no-drag，右侧空白区保留窗口拖动。自动 GitHub `renderer-smoke` 纳入真实 Electron 与 Playwright；正常态颜色、排版、按钮外观和动效基调保持冻结 |
| B2.5 | [x] | `a0f7d3f`（2026-08-18）：Omnibox 三分流、本地建议、搜索引擎设置、工具栏 AppMenu 与 view 聚焦摘挂完成；完整证据见 §11.26 |
| B2.6 | [x] | 六个内部页面已改为真实标签创建、切换、地址同步、再次激活与标签关闭契约；实现与完成标记同提交，B2 统一验证已通过，完整记录见 §11.27、§11.30 |
| B2.7-B2.8 | [x] | B2.7 下载/查找/缩放与 B2.8 完整右键菜单已实现；B2 统一验证、生产构建、NSIS 与真实 packaged 双实例 smoke 全部通过，完整记录见 §11.28-§11.30 |
| B3.1 | [x] | WindowManager/AppWindow/ViewRegistry、sender 归属路由、窗口 bounds/maximized 持久化与多显示器越界校验已完成；保持单窗口行为，完整记录见 §11.31 |
| B3.2 | [x] | per-webContents 页面事件、Tracking 多 visit、Contest 聚合、Coach 最近窗口防抖、实时提交/用户脚本精确 owner、deleteProblem 事务重算已完成；B3.3 已在此前置语义上开放拆分入口 |
| B3.3 | [x] | 完整壳标签过户、拖出/右键/双击拆分、拖回合并与过户回滚已完成；B3.4-B3.5 继续处理服务广播、窗口生命周期与多窗口快照 |
| B3.4 | [x] | `problems:updated` 全壳广播、SyncService sender 宿主、任一壳 focus 判定与比赛横幅已完成；完整记录见 §11.34 |
| B3.5 | [x] | 浏览器化关窗、桌宠/second-instance 最近窗口语义、应用级原子快照与全窗口恢复已完成；B3 全量测试、生产构建、离线 NSIS、真实 Electron 拆分 smoke 与 packaged 双实例 smoke 全部通过，完整记录见 §11.35-§11.36 |
| B4.1 | [x] | `026_site_credentials`、版本化 envelope repository、软删/revive、导出排除闭合与备份提示已完成；仅数据地基，不启用凭据保存能力，完整记录见 §11.37 |
| B4.2 | [x] | CredentialVault 已完成：DI 纯逻辑核心、异步 safeStorage、envelope/provider 校验、rotation 重加密、结构化错误码；壳 renderer 仅开放脱敏 list/delete |
| B4.3 | [x] | migration 028、DB `site_configs` 登录配置唯一源、全局 `web-contents-created` OJ session 协调器、只填充不提交的 `oj-credentials:fill` preload 通道、URL/selector 安全校验和 7 个测试文件已完成；真实七站逐站 smoke 明确延期，不宣称已完成；完整记录见 §11.43 |
| B4.4 | [x] | 账户内部标签、登录态摘要、脱敏凭据列表、重命名/删除、登录页新标签跳转、Codeforces rating 绑定和多凭据 NoticeBar 选择已完成；完整记录见 §11.44 |
| B4.5 | [x] | 登录捕获、保存/覆盖确认与 stale/取消边界已完成；完整记录见 §11.45 |
| B4.6 | [ ] | 打包 fuses 与 packaged smoke 待实施 |
| B5.1-B5.6 | [ ] | 仅按视觉冻结约束做结构收尾、暗色、无障碍、桌宠策略和 Latex |
| B6.1 | [x] | `027_userscript_runtime`、完整 metadata 持久化、严格 URL 匹配、site binding/exclude 优先级、values/资源/host/update repository 已完成；完整记录见 §11.38 |
| B6.2 | [x] | GM 私有桥、固定 frame bootstrap、IIFE/grant 裁剪、主进程值快照与 shell 源码隔离已完成；完整记录见 §11.39 |
| B6.3 | [x] | `GM_xmlhttpRequest` 主进程受限代理、`@connect` 与逐 host 授权、NoticeBar、剪贴板/菜单/onurlchange、全局 CORS 清理已完成；完整记录见 §11.40 |
| B6.4 | [x] | 固定 frame preload、预编译 catalog、DOMContentLoaded/真实 frame load 阶段调度、SPA 重匹配与 revision/generation stale guard 已完成；真实 Electron 主 frame/reload smoke 已纳入 `test:electron`，Electron 43 的普通 iframe/frame-preload 限制已按 best-effort 记录，完整记录见 §11.41 |
| B6.5-B6.7 | [ ] | `@require/@resource` 下载与 SRI、安装更新链路与管理页收口待实施 |

### 11.4 单任务完成记录模板

| 字段 | 填写内容 |
|---|---|
| 任务 | 例如 B0.12 |
| 状态 | `[x] 已完成` |
| Commit | 中文提交标题 + hash |
| 自动验证 | 实际执行的命令与结果 |
| 人工验收 | 场景、平台/窗口数量、结果 |
| 视觉影响 | `无视觉变更`，或计划允许的变化说明 |
| 文档同步 | 已更新的 README/ADR/schema/security 文档 |
| 完成时间 | 北京时间 `YYYY-MM-DD HH:mm` |

### 11.5 B0.6 完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B0.6 测试基建与诊断出口 |
| 状态 | `[x] 已完成` |
| Commit | `a466c30 test: 建立 Electron 测试替身与浏览器诊断出口` |
| 自动验证 | `npm run typecheck`、`npm run lint`、`npm run test:coverage`、`npm run test:core`、`npm run test:architecture`、`npm run test:security`、`npm run test:docs`；已通过 |
| 人工验收 | Vitest test-double 可观测窗口/视图生命周期；注入诊断对象可观察标题追踪与用户脚本服务缺失路径；结果通过 |
| 视觉影响 | `无视觉变更` |
| 文档同步 | `algo-electron/tests/README.md`、`tests/electron/README.md`、`tests/diagnostics/README.md`、`electron/diagnostics/README.md`、preload 类型与 `docs/README.md` |
| 完成时间 | 北京时间 `2026-08-16 17:22` |

### 11.6 B0.12 完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B0.12 壳信任边界 |
| 状态 | `[x] 已完成` |
| Commit | `a004d3c security: 建立 app 壳协议与 IPC 信任边界` |
| 自动验证 | `npm run typecheck`、`npm run lint`、`npm run test:core`（19 files/302 tests）、`npm run test:coverage`（39 files/335 tests，Statements 30.35%、Branches 35.45%、Functions 25.88%、Lines 31.22%）、`npm run test:electron`、`npm run test:architecture`、`npm run test:security`、`npm run test:docs`、`npm run test:performance`；已通过 |
| 人工验收 | Windows 单窗口生产壳启动成功，确认 `location.origin === app://shell`；壳与 OJ sender 生命周期随窗口/标签创建、关闭和销毁正确登记与注销 |
| 视觉影响 | `无视觉变更`；未修改 TSX/CSS，保留现有前端视觉基线 |
| 文档同步 | `electron/app/README.md`、`electron/ipc/README.md`、`tests/electron/README.md`、`tests/security/README.md` |
| 完成时间 | 北京时间 `2026-08-16 23:55` |

### 11.7 B0.1 完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B0.1 快捷键分发与显式应用菜单 |
| 状态 | `[x] 已完成` |
| Commit | `fe31338 feat: 统一浏览器快捷键分发` |
| 自动验证 | `npm run test:all`；40 个 Vitest 测试文件、338 个测试通过；覆盖率 Statements 30.56%、Branches 35.82%、Functions 25.96%、Lines 31.34%；Electron startup smoke、架构/安全/文档/打包/性能守卫通过；Playwright 宽/中/窄三视口通过 |
| 人工验收 | Electron 壳与 OJ view 均绑定同一快捷键处理器；Playwright 覆盖 1280x800、1024x720、800x600，地址栏聚焦链路的测试替身已同步；结果通过 |
| 视觉影响 | `无视觉变更`；仅增加交互行为与测试替身，未修改现有 CSS/视觉 token |
| 文档同步 | `electron/shortcuts/README.md`、`tests/shortcuts/README.md`、`electron/browser/README.md`、`electron/ipc/README.md`、`docs/README.md` |
| 完成时间 | 北京时间 `2026-08-16 23:59` |

### 11.8 B0.7 完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B0.7 死资产与死 IPC 清理 |
| 状态 | `[x] 已完成` |
| Commit | `22c7013 refactor: 清理浏览器壳死资产与死通道` |
| 自动验证 | `npm run test:all`：47 个 Vitest 测试文件、357 个测试通过，覆盖率 Statements 33.65%、Branches 37.53%、Functions 29.20%、Lines 34.64%；typecheck、lint、架构、安全、文档、打包、性能、Electron startup smoke 与 Playwright 宽/中/窄三视口均通过；补跑 `npm run test:electron`、`npm run build` 与 packaged-main 检查通过 |
| 人工验收 | 全仓扫描确认 `BrowserHost`、`public/home.html`、适配器转发壳和两个 renderer 死通道均无运行时引用；适配器测试直连真实模块，SyncService 调用点统一使用 `setScrapeHost`；TrackingService 回调和 SubmissionWatcher 主进程事件仍保留 |
| 视觉影响 | `无视觉变更`；未修改 TSX、CSS、视觉 token 或动画 |
| 文档同步 | `electron/README.md`、`electron/browser/README.md`、`electron/ipc/README.md`、`public/README.md`、ADR、系统架构、提交监控与项目规则 |
| 完成时间 | 北京时间 `2026-08-17 10:26` |

### 11.9 B0.8 完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B0.8 主进程兜底与落盘日志 |
| 状态 | `[x] 已完成` |
| Commit | `81f4c08 resilience: 增加主进程兜底与落盘日志` |
| 自动验证 | `npm run typecheck`、`npm run lint`、`npm run test:all`：52 个 Vitest 测试文件、365 个测试通过，覆盖率 Statements 34.73%、Branches 38.22%、Functions 30.41%、Lines 35.69%；架构、安全、文档、打包配置、性能、Electron startup smoke、Playwright 宽/中/窄三视口均通过；`npm run build` 与 `npm run test:packaged-app` 均通过；packaged smoke 覆盖真实 `app://shell`、隔离 userData/SQLite、localhost WebContentsView、GET/POST/about:blank/OAuth popup、权限拒绝和退出清理 |
| 人工验收 | Windows 打包应用启动后壳正常加载；模拟 renderer 崩溃/无响应具备自动 reload 与日志记录；主进程异常路径记录日志并按生产/ smoke 模式分别弹框退出或无阻塞退出；日志文件写入 `userData/logs/main.log`，敏感字段与 URL query/hash 脱敏；窗口关闭、WebContents 销毁竞态不再触发 `undefined.id` 或 `Object has been destroyed` |
| 视觉影响 | `无视觉变更`；未修改 TSX、CSS、视觉 token、布局值或动画方向 |
| 文档同步 | `electron/app/README.md`、`electron/shared/README.md`、`electron/db/README.md`、`tests/app/README.md`、`tests/shared/README.md`、`docs/README.md`、`.github/workflows/README.md` 与 CI 工作流 |
| 完成时间 | 北京时间 `2026-08-17 11:48` |

### 11.10 B0.9 完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B0.9 应用单实例锁 |
| 状态 | `[x] 已完成` |
| Commit | `ddeabfa resilience: 增加应用单实例锁`；`ed62379 test: 覆盖打包应用真实双实例启动` |
| 自动验证 | `npm run typecheck`、`npm run lint`、`npx vitest run tests/app/singleInstance.test.ts tests/electron/mainResilience.test.ts tests/electron/electronDouble.test.ts`（3 files/7 tests）、`npm run test:all`（53 files/370 tests，覆盖率 Statements 34.87%、Branches 38.31%、Functions 30.48%、Lines 35.84%）、`npm run build`、`npm run test:packaged-app`；全部通过。打包 smoke 在同一隔离 userData 下真实启动第二个 `win-unpacked` 进程，断言第二实例快速以 0 码退出、主实例持续运行并收到 `second-instance` 聚焦事件，且失败实例不写共享日志 |
| 人工验收 | Windows 单窗口主实例启动正常；真实打包双进程验证失败实例只请求退出，主实例持续存活并记录 `app.second-instance-focused`；单元测试覆盖最小化恢复、显示、聚焦，以及窗口缺失、已销毁和聚焦异常的容错与诊断 |
| 视觉影响 | `无视觉变更`；未修改 TSX、CSS、视觉 token、布局值或动画方向 |
| 文档同步 | `electron/app/README.md`、`tests/app/README.md` 与 Electron test-double/启动接线守卫 |
| 完成时间 | 北京时间 `2026-08-18 11:48` |

### 11.11 B0.10 完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B0.10 数据性能与迁移安全 |
| 状态 | `[x] 已完成` |
| Commit | `9de6661 data: 加固迁移恢复与定向统计重算` |
| 自动验证 | `npm run typecheck`、`npm run lint`、`npm run test:db`、`npm run test:docs`、`npm run test:all`、`npm run build`、`npm run test:packaged-app`；全部通过。全量为 57 个 Vitest 文件、379 个测试，覆盖率 Statements 35.73%、Branches 38.63%、Functions 31.49%、Lines 36.75%；数据库集成覆盖备份先于迁移、失败恢复、failure marker 阻断同版本重试、三份轮换、孤儿 visit 清理和定向日期重算；两年事实数据基准重复实测 0.33-0.90ms，低于 50ms 门槛；Electron startup smoke、Playwright 宽/中/窄三视口、NSIS 构建和真实 `win-unpacked` 双实例 smoke 均通过 |
| 人工验收 | 临时 SQLite 中连续执行成功迁移后故意触发下一迁移失败，确认数据库恢复到迁移前 sentinel 状态、已提交的中间 schema 不残留、failure marker 落盘且第二次启动不再执行失败版本；确认开放 visit 被按进入时间封闭并标记恢复原因；新建隔离 userData 的打包应用可完成异步初始化并正常加载 SQLite |
| 视觉影响 | `无视觉变更`；未修改 TSX、CSS、视觉 token、布局值或动画方向 |
| 文档同步 | `electron/backup/README.md`、`electron/db/README.md`、`electron/submissions/README.md`、`electron/tracking/README.md`、`tests/db/README.md`、`tests/submissions/README.md`、`tests/tracking/README.md` 与 `docs/README.md` |
| 完成时间 | 北京时间 `2026-08-18 11:59` |

### 11.12 B0.11 完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B0.11 脚本更新止血、身份迁移与本地副本 |
| 状态 | `[x] 已完成` |
| Commit | `e35212b scripts: 增加用户脚本身份更新与本地副本` |
| 自动验证 | `npm run typecheck`、`npm run test:core`、`npm run test:db`、`npm run test:unit`、`npm run test:docs`、`git diff --check` 全部通过；核心套件 27 个文件/333 个测试，完整 Vitest 62 个文件/401 个测试；数据库套件覆盖 migration 025、legacy 原子认领回滚、迁移安全、备份恢复、仓储和统计性能；IPC 聚焦覆盖 7 个用例；本块未重复执行生产构建、NSIS 和 packaged 双实例 smoke，按后续多个任务块合并验证策略执行 |
| 人工验收 | 待用户统一回归：重复导入升级/同版/降级/未知版本、取消、另存副本、无 namespace legacy 认领、旧文件与源文件保护；自动化已覆盖上述分支和数据库状态 |
| 视觉影响 | `无视觉变更`；未修改 TSX、CSS、颜色、布局或动画 |
| 文档同步 | `electron/db/README.md`、`electron/db/repositories/userScript/README.md`、`electron/scripts/README.md`、`electron/ipc/README.md`、`tests/{db,ipc,scripts}/README.md`、`docs/DESIGN/DATABASE_SCHEMA.md`、`docs/OPERATIONS/DATABASE_MIGRATION_ROLLBACK.md` |
| 完成时间 | 北京时间 `2026-08-18 12:50` |

### 11.13 B1.2 基础组件完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B1.2 Dialog/DropdownMenu/Toast/NoticeBar 与无障碍基础行为 |
| 状态 | `[x] 已完成` |
| Commit | `16bae97 ui: 补齐内部页基础反馈组件` |
| 自动验证 | `npm run typecheck`、目标 ESLint、最终基础组件聚焦 Vitest 22/22、`git diff --check`；后续 `tests/verify.mjs` 已把 `tests/components` 纳入快速 core suite，完整 Vitest 会自动收录 |
| 人工验收 | 待用户统一回归；组件未接入业务页，不改变现有页面视觉，后续 B2/B4 按内部页/NoticeBar 场景接入 |
| 视觉影响 | `无视觉变更`；仅新增未接入的基础组件和既有 token 样式 |
| 文档同步 | `src/components/ui/README.md`、`tests/components/README.md` |
| 完成时间 | 北京时间 `2026-08-18 13:20` |

### 11.14 B1.3 图标治理阶段记录（历史）

| 字段 | 填写内容 |
|---|---|
| 任务 | B1.3 低风险功能图标收拢（阶段性） |
| 状态 | `[~] 当时阶段性`；已在 §11.18 以 `[x]` 完成 |
| Commit | `9346856 ui: 收拢低风险功能图标` |
| 自动验证 | `npm run typecheck`、聚焦图标守卫 4/4、目标 ESLint、`git diff --check` |
| 人工验收 | 暂缓剩余 emoji/箭头替换，等待截图确认以避免冻结视觉漂移；桌宠 SVG 明确保留为插画而非功能图标 |
| 视觉影响 | 已完成替换保持原 class、容器尺寸和颜色；未改时间轴 emoji、笔记空态、详情链接箭头 |
| 文档同步 | `tests/components/README.md`、`tests/components/iconGovernance.test.ts` |
| 完成时间 | 北京时间 `2026-08-18 13:20` |

### 11.15 B1.5 依赖与 token 收尾阶段记录（历史）

| 字段 | 填写内容 |
|---|---|
| 任务 | B1.5 零引用依赖清理（阶段性） |
| 状态 | `[~] 当时阶段性`；依赖、Coach token 与统计卡片已由后续提交全部完成 |
| Commit | `66821d0 deps: 清理未使用的 Milkdown Nord 依赖` |
| 自动验证 | `npm ls @milkdown/theme-nord --depth=0` 确认无安装项；`npm run typecheck` 与现有 UI 聚焦测试通过；`MilkdownEditor.tsx` 仍从 Crepe 包加载 Nord CSS |
| 人工验收 | 未触及桌宠颜色、现有 feature CSS 或 token 值；剩余机械 token 化在截图/暗色验证前继续 |
| 视觉影响 | `无视觉变更` |
| 文档同步 | `package.json`、`package-lock.json`、B1 台账 |
| 完成时间 | 北京时间 `2026-08-18 13:20` |

### 11.16 B1.1 token 收尾记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B1.1 spacing/easing/暗色语义 token 收尾 |
| 状态 | `[x] 已完成` |
| Commit | `efed871 ui: 补齐设计 token 双值与治理守卫` |
| 自动验证 | `npm run typecheck`、目标 ESLint、`tests/components/tokenGovernance.test.ts`、`npm run test:core`、`npm run test:docs`、`git diff --check` |
| 人工验收 | 暗色切换仍由 B5.4 实现；本提交未改现有业务 CSS 数值、布局或动画 |
| 视觉影响 | `无视觉变更`；只增加未改变浅色现状的 token 和暗色预留值 |
| 文档同步 | `src/index.css`、`tests/components/tokenGovernance.test.ts`、`tests/components/README.md` |
| 完成时间 | 北京时间 `2026-08-18` |

### 11.17 B1.5 Coach token 收尾记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B1.5 Coach 独立视觉 token 单一来源收尾 |
| 状态 | `[x] 已完成` |
| Commit | `7df12ce ui: 收拢 Coach 独立视觉 token`（依赖清理见 `66821d0`） |
| 自动验证 | `npm run typecheck`、目标 ESLint、Coach/图标聚焦 Vitest 7/7、`npm run test:core`、`npm run test:docs`、`git diff --check` |
| 人工验收 | 原始颜色、alpha、圆角和动效时长逐值搬运；未改变桌宠 SVG、布局、状态动画或气泡交互 |
| 视觉影响 | `无视觉变更`；Coach 保持既有独立深色科技风格，不映射为主界面近似色 |
| 文档同步 | `src/features/coach/{README.md,styles/README.md}`、`tests/coach/README.md` |
| 完成时间 | 北京时间 `2026-08-18` |

### 11.18 B1.3 功能图标治理完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B1.3 运行时功能图标统一治理 |
| 状态 | `[x] 已完成` |
| Commit | `20bc054 ui: 完成功能图标统一治理`（首批见 `9346856`） |
| 自动验证 | `npm run typecheck`、目标 ESLint、图标/UI 聚焦 Vitest 18/18、运行时 Unicode/内联 SVG 审计、`npm run test:core`、`npm run test:docs`、`git diff --check` |
| 人工验收 | Playwright 截图并入后续集中 UI 回归；时间轴圆点保持 22px、空态图标保持 48px、详情链接字号不变 |
| 视觉影响 | 功能图标由字体符号等价替换为统一 24 viewBox 线性图标；不改页面配色、布局、动画或组件外观 |
| 文档同步 | `tests/components/README.md`、B1 完成台账 |
| 完成时间 | 北京时间 `2026-08-18` |

### 11.19 GitHub CI 分层守卫记录

| 字段 | 填写内容 |
|---|---|
| 任务 | GitHub Actions 自动快速守卫与手动集中验证分层 |
| 状态 | `[x] 已完成` |
| Commit | `1b4e187 ci: 拆分自动快速守卫与手动集中验证` |
| 自动验证 | PyYAML 解析 workflow；`npm run test:docs`、`git diff --check`；推送后核对 GitHub `fast-guard` 实际运行结果 |
| 远端策略 | PR 与 `main`/`master` push 自动运行 `test:core + test:docs`；`test:all`、生产 build 与 packaged smoke 仅 `workflow_dispatch` 集中触发 |
| 安全边界 | `contents: read`、checkout 不保留凭据、不接收业务 secret、不上传构建产物/用户数据/登录态 |
| 效率说明 | 每块提交不再重复触发重型构建与真实进程 smoke；需要集中验收时使用 `gh workflow run ci.yml --ref master` |
| 完成时间 | 北京时间 `2026-08-18` |

### 11.20 B1 完成审计与无障碍收口记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B1.1-B1.5 完成审计：组件默认测试标识、ConfirmDialog 焦点管理、DropdownMenu 边界、语义 token 消费与基线可追溯性 |
| 状态 | `[x] 已完成` |
| Commit | `d0fc989 ui: 收口 B1 组件契约与 token 治理`；`7240170 ui: 完成统计卡片组件收编` |
| 自动验证 | `npm run typecheck`、目标 ESLint、组件/Coach 聚焦 Vitest 6 files/35 tests、`npm run test:core`（35 files/375 tests）、`npm run test:docs`、`git diff --check`；`rg` 确认 `src` 无原生 `confirm()`，功能性 SVG 仅统一 Icon 与 CoachPet 领域插画 |
| 人工验收 | 保持 `0a1a1c4` 浅色视觉冻结；ConfirmDialog 打开后聚焦确认动作、Tab 循环、Esc/遮罩取消并恢复打开者焦点；全禁用 DropdownMenu 可用 Esc 关闭 |
| 视觉影响 | `无视觉变更`；默认 `data-testid`、焦点管理和 CSS 语义别名不改变颜色、尺寸、排版、组件形态或动效值；状态色改为现有语义 token 引用，浅色计算值保持不变并为 B5.4 暗色切换留出通道 |
| 文档同步 | `src/components/ui/README.md`、`tests/components/README.md`、B1 完成台账与视觉基线引用 |
| 剩余工作 | B1 无已知代码缺口；B2 继续标签模型与浏览器壳重构 |
| 完成时间 | 北京时间 `2026-08-18` |

### 11.21 B2.1 标签模型契约阶段记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B2.1 第一子块：有序标签模型、内部页判别联合与状态/快照契约 |
| 状态 | `[~] 部分完成` |
| Commit | `ac5fa27 browser: 扩展有序标签模型与状态契约` |
| 自动验证 | `npm run typecheck`、目标 ESLint、聚焦 Vitest 4 files/14 tests、`npm run test:core`（35 files/376 tests）、`npm run test:docs`、`git diff --check`；tabs 残余 Map API 扫描为零 |
| 人工验收 | 本子块不提前执行生产构建、NSIS 或 packaged 双实例 smoke；集中回归时再验证真实 Electron 加载、崩溃/无响应和会话恢复 |
| 视觉影响 | `无视觉变更`；未修改 CSS 或业务页面样式，renderer TSX 仅同步测试替身字段，保持 `0a1a1c4` 冻结基线 |
| 文档同步 | `electron/browser/README.md`、`tests/browser/README.md`、B2 完成台账 |
| 剩余工作 | 校验并原子保存/读取 `TabSessionSnapshot`；恢复有序标签与激活项；崩溃 view 摘除及恢复；无响应 NoticeBar 的等待/重载/关闭 |
| 完成时间 | 北京时间 `2026-08-18` |

### 11.22 B2.1 会话快照与原子存储阶段记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B2.1 第二子块：严格会话快照校验与原子文件存储 |
| 状态 | `[~] 部分完成` |
| Commit | `4f8f40f browser: 增加严格会话快照与原子存储` |
| 自动验证 | `npm run typecheck`、目标 ESLint、聚焦 Vitest 2 files/83 tests、`npm run test:core`（37 files/459 tests）、`npm run test:docs`、`git diff --check`；Windows 本机临时目录实测 `fs.rename(temp, existingTarget)` 可直接替换旧目标 |
| 人工验收 | 本子块不提前执行生产构建、NSIS 或 packaged 双实例 smoke；集中回归时再验证真实启动恢复、正常关闭前 flush、异常退出后的最近稳定会话和损坏文件回退 |
| 视觉影响 | `无视觉变更`；未修改 TSX、CSS、颜色、布局、字体、组件形态或动画，保持 `0a1a1c4` 冻结基线 |
| 文档同步 | `electron/browser/README.md`、`tests/browser/README.md`、B2 完成台账 |
| 安全边界 | 快照只允许 `id/kind/url|page/title`；生产仅恢复 HTTPS，开发只额外放行 loopback HTTP；拒绝 userinfo、敏感 query/hash、控制字符、未知字段、损坏/超限 JSON，整份失败且不输出原始 JSON/URL |
| 剩余工作 | 将存储接入 TabManager 和应用启动/退出生命周期；恢复全部标签后只切换一次活动项；renderer 首次挂载主动获取列表；实现标签崩溃占位与无响应 NoticeBar |
| 完成时间 | 北京时间 `2026-08-18 21:54` |

### 11.23 B2.1 运行时会话恢复阶段记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B2.1 第三子块：TabManager 会话恢复、变更防抖保存、退出 flush 与 renderer 首次列表同步 |
| 状态 | `[~] 部分完成` |
| Commit | `8db5c27 browser: 接入标签会话恢复与退出持久化` |
| 自动验证 | `npm run typecheck`、目标 ESLint、聚焦 Vitest 7 files/43 tests、`npm run test:core`（39 files/479 tests）、Electron 接线聚焦 2 files/5 tests、`npm run test:docs`、`git diff --check`；全部通过 |
| 人工验收 | 本子块不提前执行生产构建、NSIS、真实 startup 恢复或 packaged 双实例 smoke，继续按多任务合并验证策略执行；自动测试已覆盖恢复顺序/稳定 ID/标题/活动项、只挂活动 view、创建中途全回滚、关闭前等待最终写入和 renderer 首次列表竞态 |
| 视觉影响 | `无视觉变更`；未修改 CSS、颜色、布局、字体、组件形态或动画，TabBar 仅补首次数据同步，保持 `0a1a1c4` 冻结基线 |
| 文档同步 | `electron/browser/README.md`、`tests/browser/README.md`、`tests/electron/README.md`、B2 完成台账 |
| 生命周期 | 正常启动在服务/事件接线后、壳 loadURL 前恢复；普通变化 250ms 防抖；窗口 close 与 before-quit 最终 dispose/flush；致命 app.exit 依赖最近一次稳定防抖快照；startup smoke 禁用 session store |
| 安全与一致性 | 恢复前再次整份校验；全部 view 创建成功后才提交 live tabs，失败关闭并注销本次所有 webContents；保存事件与 favicon/loading 列表事件分离；首次列表响应不会覆盖较新的 listChanged 事件 |
| 剩余工作 | 处理 `render-process-gone`：摘除坏 view 并显示可恢复状态；处理 `unresponsive`：NoticeBar 提供等待/重载/关闭并在恢复 responsive 后撤销 |
| 完成时间 | 北京时间 `2026-08-18 22:12` |

### 11.24 B2.1 标签崩溃与无响应阶段记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B2.1 第四子块：web 标签 render-process-gone 恢复态、unresponsive 操作与 B2.1 总收口 |
| 状态 | `[x] 已完成` |
| Commit | `8c93cd7 browser: 完成标签崩溃与无响应恢复` |
| 自动验证 | `npm run typecheck`、`npm run lint`、故障/组件/IPC 聚焦 Vitest 8 files/39 tests、`npm run test:core`（40 files/484 tests）、`npm run test:ui`（1280×800、1024×720、800×600）和 `git diff --check`；全部通过 |
| 自动验收 | 覆盖活动/后台标签无响应、通知条 38px 布局让位、继续等待不伪造 responsive、responsive 自动清理、活动崩溃摘除 view、稳定 ID/URL 保留、destroyed view 替换、替换创建失败后再次恢复、恢复失败后关闭竞态、首次壳加载健康列表回放和按 tabId 操作 |
| 人工验收 | 按多任务合并验证策略，本子块未提前执行生产构建、NSIS、真实 renderer crash 注入或 packaged 双实例 smoke；正常页面三档 Playwright 截图与布局断言通过，集中 packaged 回归时补真实崩溃/无响应操作 |
| 视觉影响 | 正常态颜色、排版、组件形态和动画不变；仅新增崩溃占位页，并复用现有 Button/Icon/NoticeBar、语义色与动效 token；NoticeBar 保持普通文档流，不使用浮层 |
| 文档同步 | `electron/browser/README.md`、`electron/ipc/README.md`、`src/components/README.md`、`tests/browser/README.md`、B2 完成台账 |
| 安全与持久化 | `isCrashed`、`isUnresponsive`、通知 dismiss 状态、favicon/loading、表单、密码和脚本源码均不写入 `TabSnapshot`；日志只记录稳定 tabId、进程退出原因/码和错误名，不记录页面 URL 或内容 |
| 剩余工作 | B2.1 无已知代码缺口；下一步进入 B2.2 内部页标签化，生产构建、NSIS 与真实 packaged smoke 继续合并到后续集中回归 |
| 完成时间 | 北京时间 `2026-08-18 23:10` |

#### 完成记录：B2.2 + B2.3 内部页标签化与截图替身退役

| 字段 | 填写内容 |
|---|---|
| 任务 | B2.2 内部页标签化 + B2.3 截图替身退役 |
| 状态 | `[x] 已完成` |
| Commit | `8922c54 browser: 完成内部页标签化并退役截图浮层` |
| 自动验证 | `npm run test:core`（45 files/502 tests，包含 `tests/app` 配置迁移回归）、`npm run test:electron`、`npm run test:ui`（1280×800、1024×720、800×600）、`npm run test:docs` 和 `git diff --check`；全部通过 |
| 自动验收 | `ManagedTab`/`TabInfo`/session/关闭栈支持 web/internal 混合标签；新标签、关闭最后标签和无恢复会话进入 `algo://home`；内部页导航到 HTTP/HTTPS 时保留稳定 ID 原位转 web；设置、统计、脚本、Coach 指标、题目详情、笔记入口均打开内部标签；`credentials` 与 `script-install` 已纳入严格路由判别联合和会话模型，具体业务 UI 仍按 B4/B6 交付；旧 `defaultHomeUrl` 净化、去重、拒绝 userinfo 后迁入 `homeShortcuts`，写回失败仍保留内存配置；生产壳继续由 `app://shell` 加载 |
| 截图机制退役 | 删除 `ModalLayer`、`useAppModalState`、`useBrowserViewVisibility` 及 `browser:hideView`/`showView`/`capturePreview` 的 IPC、preload、类型、renderer helper 和测试 mock；`browser:goHome` 改为复用内部 home；截图 harness 改为真实混合标签事件模型 |
| 人工验收 | 三档 Playwright 原生 viewport 中首页、设置、统计、LLM 设置、Coach 指标和笔记均通过容器边界、横向越界、图表/编辑器渲染与敏感文本断言；真实 Electron startup smoke 验证初始内部 home、旧配置落盘迁移、显式 web 标签、权限策略与 popup 接管。按批量策略暂缓生产构建、NSIS 和真实 packaged 双实例 smoke |
| 视觉影响 | 仅把既有功能页从遮罩浮窗改为主内容区内部标签；保留原有颜色、字体、信息层级、组件形态、container query 与动画 token，不重做前端风格 |
| 文档同步 | `SYSTEM_ARCHITECTURE.md`、app/browser/ipc、renderer/components/hooks/features、home/settings 与 browser/electron/UI 测试 README、故障排查文档和本台账均已同步 |
| 安全边界 | `algo://` 仅为受控标签标识，不注册资源协议；Renderer 仍从 `app://shell` 加载。内部页 IPC 严格校验 exact-shape payload；会话不保存表单、密码、Cookie、脚本源码、favicon 或运行时健康态；旧快捷入口不接受非 HTTP(S) 或 URL userinfo |
| 剩余工作 | 下一步进入 B2.4 TabStrip；凭据中心内容属于 B4，脚本安装确认内容属于 B6。生产构建、NSIS 与真实 packaged 双实例 smoke 继续合并到后续集中回归 |
| 完成时间 | 北京时间 `2026-08-18 23:42` |

### 11.25 B2.4 Chrome 风格标签条完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B2.4 TabStrip 重写、拖拽排序、溢出交互与自动 renderer smoke |
| 状态 | `[x] 已完成` |
| Commit | `4112c01 browser: 完成 Chrome 风格标签条` |
| 自动验证 | `npm run test:core`（45 files/508 tests）、`npm run test:electron`、`npm run test:ui`（4/4，含三档 viewport 与真实 pointer 跨可视区拖拽）、`npm run test:docs`、`npm run typecheck`、目标 ESLint、`git diff --check`；全部通过 |
| 自动验收 | `TabManager.reorderTab` 按最终索引重排并广播列表/会话变化，不切换活动标签或重挂活动 view；IPC/preload/类型/harness 全链路接通。TabStrip 覆盖 favicon、内部页领域图标、loading spinner、崩溃图标、5px pointer 阈值、插入指示线、拖后 click 抑制、中键关闭、新建/关闭动画、reduced motion、滚轮横移、活动标签滚入、横向溢出边缘连续滚动、Enter/Space 与 ArrowLeft/ArrowRight/Home/End 键盘交互 |
| 原生窗口回归 | 800×600 创建 13 个内部标签，确认标签条横向溢出、右侧空白窗口拖动区为 `-webkit-app-region: drag`；从首标签真实按下 pointer 并拖到标签条右缘，等待自动滚动后释放，确认移出初始可视范围且其他标签相对顺序保持。1280×800、1024×720、800×600 既有壳层/内部页场景同步通过 |
| CI 策略 | GitHub Actions 新增自动 `renderer-smoke` job，push/PR 并行执行 `test:electron + test:ui`；生产 build、NSIS 与真实 packaged 双实例 smoke 仍保持手动集中执行 |
| 视觉影响 | TabBar 实现升级为 TabStrip，但严格沿用 `0a1a1c4` 的语义 token、浅色配色、42px 壳层关系、字体、按钮形态和动效基调；未重做业务页面或整体前端风格 |
| 文档同步 | `.github/workflows/README.md`、`electron/browser/README.md`、`electron/ipc/README.md`、`src/components/README.md`、`tests/components/README.md`、`tests/ui/README.md`、`SYSTEM_ARCHITECTURE.md` 与本台账 |
| 剩余工作 | 下一步进入 B2.5 Omnibox + AppMenu；继续按批量策略暂缓生产构建、NSIS 与真实 packaged 双实例 smoke |
| 完成时间 | 北京时间 `2026-08-18` |

### 11.26 B2.5 Omnibox 与工具栏收敛完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B2.5 Omnibox 输入解析、本地建议、搜索引擎设置、工具栏收敛与原生 AppMenu |
| 状态 | `[x] 已完成` |
| Commit | `a0f7d3f browser: 完成 Omnibox 与工具栏收敛` |
| 输入与导航 | 主进程统一解析内部 `algo://` 路由、显式/推断 HTTPS URL 与搜索查询；拒绝畸形内部 URL、userinfo、危险/不支持协议和生产 HTTP。内部页导航原位替换当前标签并保留标签 ID、顺序与会话位置；普通 Web 导航继续经过既有安全策略 |
| 本地建议 | `browser:omniboxSuggest` 只读取本地 `problems` 与 `problem_visits`，固定最多 8 条，支持精确/前缀/包含、访问历史与时间排序，正确转义 LIKE `%`、`_`、反斜杠并过滤软删记录；URL 与 problem 双重去重。空查询走 `last_visited_at` 有界路径，访问历史候选固定最多读取最近 64 条 |
| 交互与工具栏 | 地址栏草稿与活动 URL 隔离，140ms debounce、过期响应丢弃、加载态、ArrowUp/ArrowDown/Enter/Escape、IME、Ctrl/Cmd+L、ARIA combobox/listbox 和左键 pointer 提交均完成。聚焦时主进程摘除活动 WebContentsView，失焦/提交/卸载/壳重载后恢复；工具栏保留首页、后退、前进、刷新、抓取与同步消息，统计、Coach、脚本、设置收纳进原生 `Menu.popup()` 三点菜单 |
| 搜索设置 | 默认 Bing，可选 Google、Baidu 与自定义模板；自定义模板要求 HTTPS、无 userinfo、且仅含一个 `{query}`。配置迁移、主进程规范化、写盘成功后再发布内存状态和写失败回滚均已覆盖；Renderer 始终以主进程返回配置为准 |
| 安全收口 | 完整浏览器壳与 Coach 桌宠拆为独立 trusted sender registry；普通 browser/config/omnibox IPC 仅允许完整壳，Coach 桌宠仅保留最小白名单能力；敏感 Coach 通道保持完整壳专用，发给 Renderer 的 Coach config 会剥离 `encrypted_api_key` envelope |
| 自动验证 | 最终 `npm run test:core`：51 files / 579 tests；`npm run test:db`：8 files / 16 tests，并通过 Electron 原生 backup/import、migration safety、daily stats performance 与 repositories 套件；`npm run test:electron`；`npm run test:ui`：4/4；`npm run test:docs`；目标 ESLint、TypeScript 与 `git diff --check`；全部通过 |
| 性能观测 | 10 万题数据下，非空 metadata 的 leading-wildcard LIKE 常见词中位约 46.7ms、稀有词约 13.45ms；当前满足功能交付且未用“只搜最近 N 条”破坏语义。若数据规模继续增长，后续应独立引入 FTS5/专用搜索索引与 100k 性能门槛 |
| 视觉影响 | 严格保持 `0a1a1c4` 冻结基线；复用既有地址输入、按钮、颜色、字体、间距和动画 token，仅新增文档流全内容区建议面板并删除旧“前往”及四个分散功能按钮；未重做页面风格 |
| 文档同步 | app/browser/contextMenus/problem repository/ipc、renderer components/settings、security/app/browser/components/db/ipc/UI 测试 README、`docs/README.md` 与本台账 |
| 剩余工作 | 下一步进入 B2.6 Playwright 标签导航流程重写；B2.7/B2.8 完成后统一执行生产构建、NSIS、真实 packaged 双实例 smoke 与 B2 全量回归 |
| 完成时间 | 北京时间 `2026-08-18` |

### 11.27 B2.6 Playwright 标签导航流程完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B2.6 Playwright 内部页流程改写与标签容器契约 |
| 状态 | `[x] 已完成；B2 统一验证通过` |
| Commit | `test: 重写 B2.6 标签导航 UI 契约`（代码与本完成标记同提交） |
| 标签流程 | 学习统计、设置、脚本管理、Coach 指标、题目详情、本地笔记六类内部页均验证：创建后标签数增加、活动 tab ARIA、受控 `algo://` 地址、路由容器可见、切回首页、再次激活、从标签关闭并恢复首页 |
| 截图与布局 | 壳面 Omnibox/题库流程与六内部页标签流程拆成独立场景；新增脚本管理与题目详情截图。响应式断言只读取 `.content-area`、`.main-content`、`.shell-route-*` 的真实边界，Dashboard/设置/Coach/笔记断点按当前 route 宽度判断 |
| 契约复用 | Screenshot harness 删除手写 internal URL/title，直接复用生产 `getInternalPageUrl()` 与 `getInternalPageTitle()`；mock 的标签列表、切换、排序、关闭和地址同步继续通过事件模型驱动 |
| 退役清理 | `tests/ui/` 已不再引用 `.modal-panel`、`.modal-workspace`、`capturePreview`、`hideView`、`showView` 或旧页面关闭按钮导航流程；禁止重新引入截图背景与浮窗容器假设 |
| 自动验证 | 已纳入 §11.30 的 B2 统一验收：`npm run test:all`、Playwright 三档 viewport、生产构建、NSIS 与真实 packaged 双实例 smoke 全部通过 |
| 视觉影响 | 仅重写测试契约与补充截图场景；未修改 runtime、CSS、颜色、排版、按钮、动画或冻结视觉基线 |
| 文档同步 | `tests/ui/README.md` 与本台账 |
| 剩余工作 | B2.6 无已知缺口；B2 整体已通过统一验收，下一步进入 B3.1 |
| 完成时间 | 北京时间 `2026-08-18` |

### 11.28 B2.7 下载、页内查找与按 origin 记忆缩放完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B2.7 Chrome 基线交互：页内查找、按 origin 记忆缩放、受控下载与 `.user.js` 安装边界页 |
| 状态 | `[x] 已完成；B2 统一验证通过` |
| Commit | `browser: 完成下载查找与缩放`（代码与本完成标记同提交） |
| 页内查找 | Ctrl/Cmd+F 打开文档流查找条；Enter/Shift+Enter、前后按钮、Escape/关闭均通过 `findInPage` IPC；按活动标签维护匹配状态，导航、切换、崩溃、关闭和壳重载时清理；查找条与无响应/下载通知条累加顶部让位，不遮挡 WebContentsView |
| 缩放 | 使用 Chrome 风格离散档位；仅对规范化 HTTP(S) origin 持久化，限制范围与条目数；导航、切换、恢复会话、崩溃替换和 Ctrl/Cmd+滚轮均恢复；三点菜单复用同一档位控制 |
| 下载 | 普通下载统一进入受控 `userData/downloads`；文件名净化、目录穿越防护、重名分配、`defaultSession` 与 `persist:oj-main` 均接入；完成/取消/中断通过 NoticeBar 反馈 |
| `.user.js` | 当前标签导航、重定向、popup 和普通下载统一转入短期 `script-install` 内部页；安装请求带 TTL/数量上限，不落盘、不解析、不执行，完整安装流程留给 B6；不进入关闭栈或会话快照 |
| 视觉影响 | 严格保持冻结的前端视觉基线；仅复用既有 NoticeBar、按钮和间距 token，新增查找条与安装边界页的文档流布局 |
| 自动验证 | 已纳入 §11.30 的 B2 统一验收：下载文件名净化与目录边界、查找/缩放、Electron/DB/security/docs、Playwright、生产构建、NSIS 与真实 packaged smoke 全部通过 |
| 剩余工作 | B2.7 无已知缺口；B2 整体已通过统一验收，下一步进入 B3.1 |
| 完成时间 | 北京时间 `2026-08-18` |

### 11.29 B2.8 原生右键菜单体系完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B2.8 页面、标签、壳内编辑区与内部页空白处的 Chrome 风格右键菜单 |
| 状态 | `[x] 已完成；B2 统一验证通过` |
| Commit | `browser: 完成原生右键菜单体系`（代码与本完成标记同提交） |
| 页面右键 | WebContentsView 的 `context-menu` 事件统一走原生 `Menu.popup()`；链接支持新标签打开/复制地址，图片支持新标签打开/复制图片/复制地址/另存为，选中文本支持复制与按当前搜索引擎搜索，可编辑区按 `editFlags` 提供撤销/重做/剪切/复制/粘贴/全选，空白处提供后退/前进/重新加载 |
| 标签右键 | 重新加载、复制标签页、关闭、关闭其他、关闭右侧、恢复关闭和复制网址均由 TabManager 执行；“移到新窗口”保留原生菜单挂点并在 B3 对等窗口壳完成前置灰，避免旧 DetachedWindow 被误当成完整拆分窗口 |
| 壳内右键 | BrowserWindow 壳的编辑区与内部页空白处使用同一原生菜单；Omnibox 额外提供“粘贴并前往”，剪贴板内容重新经过 Omnibox 三分流与导航安全策略 |
| 叠层边界 | 不新增 DOM 菜单或 WebContentsView 覆盖层；页面菜单、标签菜单、壳菜单均由 OS 原生菜单绘制，保留冻结的前端视觉基线 |
| IPC 与文档 | 新增 `browser:showShellContextMenu`、`browser:showTabContextMenu` 受限入口，同步 preload、ambient types、IPC 契约、contextMenus/browser README 与测试 mock |
| 自动验证 | 已纳入 §11.30 的 B2 统一验收：右键菜单模板、IPC/preload 契约、trusted sender、安全 URL 边界、Playwright、生产构建、NSIS 与真实 packaged smoke 全部通过 |
| 完成时间 | 北京时间 `2026-08-19` |

### 11.30 B2 标签体系 Chrome 化统一验收记录

| 字段 | 填写内容 |
|---|---|
| 验收范围 | B2.1-B2.8：标签模型与恢复、内部页标签化、截图替身退役、TabStrip、Omnibox/AppMenu、Playwright 标签导航、下载/查找/缩放和完整原生右键菜单体系 |
| 状态 | `[x] B2 完整通过` |
| Commit | `test: 完成 B2 统一验收`（验证修复与本完成标记同提交） |
| 全量测试 | 第二轮 `npm run test:all` 完整通过：TypeScript、全仓 ESLint、architecture/security/docs/packaging/performance、Vitest `90 files / 684 tests`、DB/Electron/safeStorage/startup smoke 全部通过 |
| 覆盖率 | Statements `47.28%`、Branches `47.30%`、Functions `42.83%`、Lines `48.92%` |
| UI 回归 | Playwright `7/7` 通过，覆盖 1280x800、1024x720、800x600；六类内部页按真实标签创建、切换、地址同步、再次激活与关闭，首页标签异步就绪后再读取基线数量，消除启动竞态 |
| 集中修复 | 第一轮统一验证发现并修复两项测试/静态检查问题：下载文件名控制字符净化不再使用触发 `no-control-regex` 的正则，并新增控制字符用例；Playwright 内部页流程先等待首页活动标签稳定，再采集标签数量基线 |
| 生产打包 | `npm run build:win` 完整退出码为 0：renderer/main/preload 生产构建、`test:packaged-main`、electron-builder x64 NSIS、`test:packaged-app` 全部通过 |
| 真实 packaged smoke | `release/2.0.0-beta.2/win-unpacked/AlgoLearningPlatform.exe` 真实启动验证通过：双实例限制生效、第二实例聚焦主窗口、SQLite 可加载 |
| 安装产物 | `release/2.0.0-beta.2/AlgoLearningPlatform-Windows-2.0.0-beta.2-x64-Setup.exe`、对应 blockmap 与 `win-unpacked` 目录均已生成 |
| 视觉影响 | 本次仅修复验证稳定性并更新台账；未修改 CSS、颜色、字体、按钮形态、整体布局或动画基调，继续冻结既有前端风格 |
| 后续工作 | B2 无已知代码缺口；下一步进入 B3.1 `WindowManager`/`AppWindow`、sender 路由化、窗口 bounds 持久化与多显示器越界校验 |
| 完成时间 | 北京时间 `2026-08-19` |

### 11.31 B3.1 窗口所有权与 sender 路由完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B3.1 `WindowManager`/`AppWindow`、应用级 ViewRegistry、IPC sender 路由和窗口 bounds/maximized 持久化 |
| 状态 | `[x] 已完成` |
| Commit | `browser: 完成 B3.1 窗口所有权基础层`（代码、测试、ADR 与本完成标记同提交） |
| 窗口模型 | 新增 `AppWindow`、`WindowManager`、`ViewRegistry`、`WindowCreationGate`；完整壳、TabManager、shell webContents 与 web 标签 view 建立唯一 `windowId/tabId` 归属。`main.ts` 删除模块级 `win/tabManager` 单槽，重叠 activate 建窗合并为同一 promise；B3.5 以 `ApplicationSessionPersistence` 统一管理全窗口快照和退出 flush |
| View 生命周期 | TabManager 在创建/popup、web/internal 互转、崩溃替换、会话恢复与失败回滚、关闭和 destroy 路径成对维护 ViewRegistry；冲突 owner fail closed，并预留 B3.3 `transferTab` 过户原语 |
| IPC 路由 | trusted sender 在既有 main-frame/origin/payload 校验后解析 `AppWindow` owner；`tab:*`、`browser:*`、`window:*`、原生菜单和 Backup/Sites/Scripts 对话框全部按 sender 路由。双可信 shell 测试证明导航和窗口按钮互不串窗；备份待确认导入按 `windowId` 隔离并随 shell 销毁清理 |
| 定向事件与下载 | URL、标签列表、查找、缩放、问题更新和窗口最大化事件由所属 AppWindow 发回自己的壳；下载开始时捕获来源 `windowId`，标签随后关闭也不会改投其他窗口；非空未知 source fail closed，仅缺失 source 且恰好一个壳窗口时允许回退 |
| 窗口状态 | `browser-window-state.json` 独立保存 normal bounds 与 maximized，250ms debounce、store 级串行队列和临时文件原子替换；恢复支持负坐标副屏，损坏/超限状态回退居中默认值，显示器拔除或完全越界时校正到主屏 workArea |
| 架构约束 | 新增 ADR-0004 与 architecture guard：禁止恢复模块级 `win/tabManager`，浏览器 IPC 不得注入全局窗口 getter，窗口敏感 handler 与原生对话框必须从 trusted sender owner 解析 |
| 自动验证 | `npm run test:core` 完整通过：TypeScript、全仓 ESLint、architecture `7/7`、security，以及 Vitest `65 files / 661 tests`；额外 B3.1 定向窗口/IPC/下载/主进程测试均通过；`npm run test:docs` 与 `git diff --check` 无错误 |
| 视觉影响 | 未修改 `src/`、CSS、颜色、字体、按钮形态、整体布局或动画基调；现有前端风格继续冻结 |
| 暂缓验证 | 按批量策略，本任务不单独运行生产构建、NSIS 或真实 packaged 双实例 smoke；B3.2-B3.5 完成后统一执行整个 B3 验收 |
| 后续工作 | 进入 B3.2：导航事件 per-webContents 化，ContestGuard 多流聚合、TrackingService 多 visit、提交/脚本/Coach 直达消费者；B3.2 完成前拆分入口保持禁用 |
| 完成时间 | 北京时间 `2026-08-19` |

### 11.32 B3.2 多源页面事件链路完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B3.2 per-webContents 页面事件源、Tracking/Contest/Coach 多窗口服务语义、实时提交与用户脚本精确 owner、tracking repository 与 deleteProblem 事务重算 |
| 状态 | `[x] 已完成` |
| Commit | `browser: 完成 B3.2 多源页面事件链路`（代码、测试、架构文档与本完成标记同提交） |
| 页面事件 | `TabManager` 发布统一 `{windowId, tabId, webContentsId, url, isMainFrame, reason}`；覆盖 did-navigate、SPA did-navigate-in-page、dom-ready、page-title-updated、did-frame-finish-load、did-finish-load、active-tab-changed、destroyed；iframe 不覆盖顶层 URL，destroyed exactly-once，脚本执行和导航均拒绝 stale owner |
| Tracking 与数据库 | `TrackingService` 按 windowId 并行维护 visit，同题去重并按来源精确关闭；problem/visit/activity 写入收进事务 repository；`deleteProblem` 在事务内删除关联事实并重算所有受影响日期，post-commit 重算失败写入诊断而不误报删除失败 |
| 提交与脚本 | RealtimeSubmissionService 可 attach/detach 多个 TabManager，跨 frame 注入覆盖 SPA/后台标签，未知、已导航或已 detach 的 OJ sender fail closed；用户脚本和题目标题提取按精确 page event 注入，背景同 URL 标签互不串页 |
| Contest 与 Coach | 全局 `ContestUrlAggregator` 聚合所有窗口并在 detach/destroy 清理；Coach 单会话以最近窗口为跟随目标，200ms 防抖，约束抓取绑定精确 page event 并用 generation 丢弃迟到结果；窗口 recency 变化有去重订阅 |
| 自动验证 | B3.2 定向矩阵通过：Vitest `25 files / 317 tests`；核心回归 `npm run test:core` 通过（Vitest `70 files / 677 tests`）；Coach `13 files / 286 tests` 与 Electron LLM 配置检查通过；DB suite（Vitest、backup/import、migration safety、stats benchmark、repositories）通过；`npm run typecheck`、`npm run lint`、architecture `7/7`、security、docs 与 `git diff --check` 全部通过 |
| 视觉影响 | 未修改前端 TSX/CSS、颜色、字体、按钮形态、整体布局或动画基调；继续冻结既有前端风格 |
| 暂缓验证 | 按批量策略，本任务不运行生产构建、NSIS 或真实 packaged 双实例 smoke；B3.3-B3.5 完成后统一执行整个 B3 验收 |
| 后续工作 | 进入 B3.3：完整壳标签过户、拖出/右键/双击拆分、拖回合并与过户回滚；该任务已完成，下一步进入 B3.4 |
| 完成时间 | 北京时间 `2026-08-19` |

### 11.33 B3.3 完整壳标签过户与拆分入口完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B3.3 完整壳拆分、标签过户、拖回合并、三种拆分入口与失败回滚 |
| 状态 | `[x] 已完成` |
| Commit | `browser: 完成 B3.3 完整壳标签过户`（代码、测试、架构文档与本完成标记同提交） |
| 完整壳 | `main.ts` 支持恢复窗口与空壳窗口两种创建模式；拆分目标不恢复旧会话、不创建默认首页，但完整安装 shell、TabManager、IPC、追踪、脚本、提交监测和 Coach 挂点 |
| 过户原语 | `TabManager.releaseTab/adoptTab` 保持稳定 tabId 与同一 WebContentsView；顺序为源父摘除、注册表 transfer lock、owner 更新、目标接纳和目标挂载；重复过户、挂载失败、源销毁均 exactly-once 回滚或失效 |
| 过户协调 | 新增 `TabTransferCoordinator`，按 tabId 加锁；同窗标签栏落点排序，其他壳标签栏落点执行拖回，壳外落点新建完整窗口；移动最后标签后源窗口关闭，失败目标自动关闭 |
| 入口与契约 | 恢复双击；右键“移到新窗口”启用；拖拽提交目标索引与屏幕坐标，经 `tab:moveToNewWindow`/`tab:finishDrag` 受 trusted sender 校验；旧 `DetachedWindow.ts` 删除，旧 `tab:detach` 无运行时引用 |
| 测试 | 过户/注册表/协调器/IPC/TabStrip 定向验证：`7 files / 50 tests`；`npm run test:core` 完整通过：Vitest `72 files / 689 tests`、TypeScript、全仓 ESLint、architecture `7/7` 与 security 全绿；迁移成功后销毁源 TabManager 不会关闭目标 webContents |
| 视觉影响 | 未修改 CSS、颜色、字体、按钮形态、整体布局或动画基调；仅恢复既有 TabStrip 手势并复用现有原生菜单与壳样式 |
| 暂缓验证 | 按批量策略，本任务不运行生产构建、NSIS 或真实 packaged 双实例 smoke；B3.4-B3.5 完成后统一执行整个 B3 验收 |
| 后续工作 | B3.4：`problems:updated`/SessionTracker/SyncService 等剩余服务的全窗口广播与活跃标签语义；B3.5：任一窗口关闭、全窗口会话快照与重启恢复 |
| 完成时间 | 北京时间 `2026-08-19` |

### 11.34 B3.4 剩余服务多窗口化完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B3.4 问题更新广播、SyncService sender 路由、ProblemSessionTracker 应用级 focus 与比赛模式横幅 |
| 状态 | `[x] 已完成` |
| Commit | `browser: 完成 B3.4 剩余服务多窗口化`（代码、测试、架构文档与本完成标记同提交） |
| 问题广播 | 标题补全、实时提交、手动同步及 Notes/Problem/Sites IPC 的更新出口统一调用 `WindowManager.sendToAll('problems:updated')`；任一窗口写入后所有壳同步刷新 |
| 同步宿主 | 删除 SyncService 的可变 `setScrapeHost` 单槽；`submissions:syncVjudge`/`syncCurrentPage` 经 trusted sender 解析所属 AppWindow，并把该窗口 TabManager 作为本次 scrape host；抓取开始时固定页面 URL，等待脚本期间切换标签不会错配题目上下文，跨窗口并发不互相覆盖 |
| 会话活跃 | `WindowManager.hasFocusedWindow()` 提供应用级聚焦事实；ProblemSessionTracker 保持最近窗口单会话跟随，但 active_seconds 只要求任一完整壳聚焦且系统未空闲 |
| 比赛横幅 | ContestGuard 状态广播全部 AppWindow；壳复用现有 NoticeBar 展示“比赛模式 / Coach 已静默”，TabManager 同步增加 38px view inset；比赛中创建或 reload 的壳在 did-finish-load 回放当前状态，renderer 先订阅实时事件再补读 `coach:getState`，避免加载期丢事件 |
| 测试 | 定向验证 `8 files / 24 tests`；`npm run test:core` 完整通过：Vitest `74 files / 695 tests`、TypeScript、全仓 ESLint、architecture `7/7` 与 security 全绿；补充比赛状态初始快照/迟到快照竞态、DOM 抓取期间标签切换及 mainResilience 源码守卫，IPC 合约扫描已识别 `sendToAll` 广播出口 |
| 视觉影响 | 未修改 CSS、颜色、字体、按钮形态、整体布局或动画基调；比赛提示仅复用 B2 已有 NoticeBar 与既有 warning token |
| 暂缓验证 | 按批量策略，本任务不运行生产构建、NSIS 或真实 packaged 双实例 smoke；B3.5 完成后统一执行整个 B3 验收 |
| 后续工作 | B3.5：任一窗口关闭与最后窗口退出、桌宠/second-instance 最近窗口、全窗口标签快照原子落盘和重启恢复 |
| 完成时间 | 北京时间 `2026-08-19` |

### 11.35 B3.5 多窗口生命周期与应用级会话恢复完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | B3.5 任一完整壳独立关闭、最后壳退出、桌宠/second-instance 最近窗口语义、全窗口标签快照原子落盘与重启恢复 |
| 状态 | `[x] 已完成；B3.5 定向、核心与真实 Electron smoke 通过` |
| Commit | `browser: 完成 B3.5 多窗口生命周期与会话恢复`（代码、测试、文档与本完成标记同提交） |
| 窗口生命周期 | 每个完整壳拥有独立 `TabManager`；关闭最后标签在 B3 模式委托所属壳关闭；关闭窗口只销毁仍归属该壳的 tabs，已过户 view 不受影响；最后完整壳关闭时先清理桌宠再退出应用 |
| 拆分窗口 | transfer 空壳不创建首页、不写入应用会话；源壳关闭后目标壳继续保留原 tab、提交/追踪/脚本/比赛语义和壳 IPC |
| 桌宠与单实例 | 桌宠解除全局 `alwaysOnTop`，默认跟随最近活跃完整壳并在父壳关闭前解绑；second-instance 通过 `WindowManager.getMostRecent()` 动态解析并恢复/显示/聚焦最近壳 |
| 应用快照 | 新增 `applicationSessionSnapshot.ts` 与 `applicationSessionStore.ts`；一份应用级快照保存合法窗口 ID、normal bounds、maximized、标签顺序、activeTabId 与最近窗口；严格拒绝重复 ID、敏感 URL、空 transfer 壳、超限和损坏 JSON；write + fsync + close + rename 原子替换，防抖合并最新快照 |
| 恢复与迁移 | 启动先恢复最近窗口，再静默恢复其他窗口；按现存显示器 workArea 校正 bounds；单窗恢复失败继续尝试其他窗口，全部失败回退内部 home；旧 `browser-session.json`/`browser-window-state.json` 仅作为缺少应用快照时的一次性迁移输入 |
| 关闭竞态 | 窗口 close 与 before-quit 共用应用级 flush/dispose；重复 close、窗口销毁、退出和最近窗口变化不会产生重复写入或已关闭窗口回写；`WindowSessionRegistry` 由应用级 persistence 取代 |
| 测试 | 定向窗口/会话/桌宠/单实例矩阵 `12 files / 92 tests` 通过；`npm run test:core` 通过：Vitest `76 files / 734 tests`、TypeScript、全仓 ESLint、architecture `7/7`、security 全绿；`npm run test:docs`、`git diff --check` 通过；`npm run test:electron` 真实 Electron startup smoke 通过，覆盖拆分、源壳关闭、目标壳存活和 BrowserWindow 数量无泄漏 |
| 视觉影响 | 未修改 CSS、颜色、字体、按钮形态、整体布局或动画基调；桌宠仅调整原生父子窗口关系，浏览器壳继续复用冻结的前端视觉 |
| 统一验收 | B3.5 子提交后已按批量策略完成生产构建、离线 NSIS、packaged 双实例 smoke 与全量验收，结果和产物校验见 §11.36 |
| 后续工作 | B3 无已知代码或验收缺口；下一步进入 B4.1 `026_site_credentials`、凭据 repository 与导出边界 |
| 完成时间 | 北京时间 `2026-08-19` |

### 11.36 B3 多窗口对等壳统一验收记录

| 字段 | 填写内容 |
|---|---|
| 验收范围 | B3.1-B3.5：窗口所有权与 sender 路由、多源页面事件、完整壳标签过户、剩余服务多窗口化、任意壳关闭和应用级会话恢复 |
| 状态 | `[x] B3 已完成；全量测试、生产构建、NSIS、真实 Electron 与 packaged smoke 全部通过` |
| Commit | `test: 完成 B3 统一验收`（过期断言修正、验收记录与完成标记同提交） |
| 全量验证 | `npm run test:all` 通过：Vitest `111 files / 797 tests`；覆盖率 statements `52.97%`、branches `51.16%`、functions `48.32%`、lines `55.14%`；DB、AI、架构、文档、性能、安全、真实 Electron startup smoke 与 Playwright `7/7` 全绿，Playwright 覆盖 `1280x800`、`1024x720`、`800x600` |
| 拆分实机 smoke | `npm run test:electron` 通过；真实 Electron 启动后拆分完整壳、关闭原壳，目标壳仍可继续 IPC 与页面状态，BrowserWindow 数量符合预期且无泄漏 |
| 生产构建与 NSIS | renderer/main/preload 生产构建通过。常规 builder 因本机 `hosts` 将 GitHub 下载域名映射到 `127.0.0.1` 而无法联网取依赖；改用仓库已安装 Electron 的 `electron-builder --win nsis --config.electronDist=node_modules/electron/dist` 完成等价离线 NSIS 打包 |
| Packaged smoke | `npm run test:packaged-app` 通过：单实例锁有效，第二实例请求聚焦主实例，打包程序可正常加载 SQLite |
| 安装包产物 | `AlgoLearningPlatform-Windows-2.0.0-beta.2-x64-Setup.exe`：`121241554` bytes，SHA-256 `BF6E6CCDEF3EB2A2EB181DBBA015C122F64A56A84415E665530EC5A761D46D04`；生成时间北京时间 `2026-08-19 19:57:48` |
| 增量与解包产物 | `.blockmap`：`127349` bytes，SHA-256 `DD01E806ECDF0790F0784732FCA1CD0614CA0BC6BB9F7D31DE43EA0675CFC319`；`win-unpacked/AlgoLearningPlatform.exe`：`225533952` bytes，SHA-256 `691AF4DFD1358DDA7F7CB990A0519EF0B0E909F7BAA88C983D14EDA7ECCB2F6E` |
| 回归修正 | 首轮 `test:all` 发现 `realtimeTabActivation.test.ts` 仍断言旧的活动标签 DOM-ready 调用；运行时已在 B3.2 改为精确 `BrowserPageEvent` owner 路由并保留兼容通知，因此将静态断言和测试索引更新为多窗口/多标签 owner 契约；定向复核确认不是行为回归，最终全量通过 |
| 视觉影响 | 统一验收与测试修正未修改任何 CSS、颜色、字体、按钮、布局或动画；前端视觉冻结继续生效 |
| 剩余工作 | B3 无已知缺口；进入 B4.1，继续按子块提交、B4 整块统一生产与 packaged 验收策略执行 |
| 完成时间 | 北京时间 `2026-08-19` |

### 11.37 B4.1 站点凭据数据地基完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | migration `026_site_credentials`、版本化 secret envelope、凭据 repository、普通导出排除边界与失败恢复不变量 |
| 状态 | `[x] 已完成；仅建立主进程数据地基，未启用凭据保存、自动填充或登录捕获` |
| Commit | `data: 完成 B4.1 站点凭据数据地基`（代码、测试、文档与完成标记同提交） |
| 迁移 | `site_credentials` 包含 `id/site_id/username/secret_envelope/last_used_at/sync_excluded/created_at/updated_at/deleted_at`；`UNIQUE(site_id, username)`、站点外键级联、活动/软删 envelope CHECK 和站点/最近使用索引均已落地；连接迁移版本由 025 升至 026 |
| Envelope | repository 只接受 `{version:1, provider:"electron-safe-storage", ciphertextBase64:string}`；拒绝明文、非法 base64、未知 provider、缺版本和额外字段；活动行必须有 envelope，软删清空密文并保留 tombstone |
| Repository | `upsertCredential` 同身份冲突时 revive 原行并保留 ID；`listCredentials` 只返回脱敏摘要；`getCredentialById` 仅供主进程后续 Vault；`softDeleteCredential` 清密文；`markCredentialUsed` 单独更新最近使用时间；兼容导出口与 README 已同步 |
| 导出边界 | 普通学习 JSON 动态列出 `sqlite_master` 中全部未导出表，明确排除 `site_credentials`、用户脚本、Cookie、队列、Coach/AI/笔记/站点等非学习表，并列出 `submissions.raw_json`、日志、本机路径等字段；设置页提示“完整备份请用数据库备份” |
| 测试 | 定向 Vitest `3 files / 4 tests` 通过；`npm run test:db` 通过：Vitest `11 files / 19 tests`、备份导入、迁移失败恢复、三份轮换、repository 与日统计 benchmark 全绿；额外覆盖密文不变量、导出清单闭合、软删/revive、UNIQUE/CHECK/FK 和 026 后续迁移失败恢复 |
| 文档 | `DATABASE_SCHEMA.md`、`DATA_EXPORT_AND_IMPORT.md`、`SECURITY.md`、数据库迁移/DB/repository README 与本计划同步；未修改 CSS、颜色、字体、按钮、布局或动画 |
| 顺序说明 | 因计划固定 B4.1=026、B6.1=027，先落 B4.1 是保持 migration 单调递增的唯一前置例外；B4.2-B4.6 仍严格等待 B6.1-B6.4，尤其 B6.3 的主进程代理与全局 CORS 清除 |
| 后续工作 | 进入 B6.1；完成 B6.1-B6.4 后再实施 B4.2 Vault、自动填充、账户页、登录捕获和 fuses |
| 完成时间 | 北京时间 `2026-08-19` |

### 11.38 B6.1 用户脚本运行时数据地基完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | migration `027_userscript_runtime`、完整 metadata 持久化、严格 URL 匹配、显式站点绑定语义与四类运行时 repository |
| 状态 | `[x] 已完成；只建立主进程数据/匹配地基，尚未向页面开放新 GM 桥或跨域代理` |
| Commit | `scripts: 完成 B6.1 用户脚本运行时数据地基`（代码、测试、文档与完成标记同提交） |
| Metadata 与升级 | parser 分离 `@match/@include/@exclude/@exclude-match`，并持久化 namespace、grant、connect、noframes、run-at、update/download URL、antifeature 与 icon；027 从存量源码回填旧版混存在 `match_urls_json` 的 include，保持 026 升级后的脚本范围语义 |
| 匹配边界 | 严格 `@match` 按 scheme/host/path 编译并锚定 host，scheme/host 大小写不敏感、path 大小写敏感，目标 query/hash 忽略；非法 match never-match，include/exclude 支持 glob 和显式 flags regex；两类 exclude 最高优先，非空 `site_ids_json` 是正向范围的权威来源，未知/禁用站点和坏 JSON fail closed |
| 运行时存储 | 新增 `user_script_values`、`user_script_resources`、`user_script_host_permissions`、`user_script_update_state`；values 受 JSON CHECK，资源区分 require/resource、保存声明顺序与原始 BLOB/encoding，host 授权支持 revoke/revive，update state 保存 ETag/Last-Modified/next check/status；四表均随脚本 FK cascade |
| Repository 与导入 | `userScriptRuntimeRepository` 提供值、资源、host 和更新状态 API；`createScript/updateScript/updateScriptWithLegacyClaim` 全量接通 027 列并归一 noframes；导入 create、覆盖更新、legacy claim 和 local copy 共用完整 metadata 映射，继续保留用户显示名、启停和站点配置 |
| 测试 | B6.1 定向 `5 files / 21 tests` 通过；`npm run test:core` 通过：Vitest `77 files / 744 tests`、TypeScript、全仓 ESLint、architecture `7/7` 和 security 全绿；`npm run test:db` 通过：Vitest `13 files / 23 tests`，并通过 Electron ABI 下备份导入、迁移失败恢复、repository 与日统计 benchmark；`npm run test:docs` 通过 |
| 数据与安全 | 普通学习 JSON 导出动态排除四张 runtime 表；host permission 仅是 B6.3 代理的授权数据地基，不代表页面已获得跨域能力；新 runtime 表尚未接入页面，legacy GM polyfill 留待 B6.2 重写，用户脚本源码继续禁止进入日志和 shell renderer |
| 文档与视觉 | `DATABASE_SCHEMA.md`、导出/回滚/安全文档、DB/migration/repository/scripts/test README 与公开 `UserScriptRecord` 类型同步；未修改 TSX、CSS、颜色、字体、按钮形态、布局或动画，前端视觉冻结不变 |
| 暂缓验证 | 按批量策略，本任务不运行生产构建、NSIS、真实 Electron 或 packaged 双实例 smoke；待 B6 更大阶段统一执行 |
| 后续工作 | 进入 B6.2：固定 userscript bootstrap preload、IIFE/按 grant 裁剪的 GM 私有桥与主进程值快照；B4.2-B4.6 仍等待 B6.1-B6.4 全部完成 |
| 完成时间 | 北京时间 `2026-08-19` |

### 11.39 B6.2 GM 私有运行时桥完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | 固定 userscript bootstrap preload、主进程内存快照、按 grant 裁剪的 IIFE 运行器、每导航私有 MessagePort 与 shell 源码隔离 |
| 状态 | `[x] 已完成；B6.3 的跨域代理、剪贴板/菜单等 API 与 B6.4 的真实 document-start/end/idle 时序验收留待后续` |
| Commit | `scripts: 完成 B6.2 GM 私有运行时桥`（代码、测试、文档与完成标记同提交） |
| 主进程缓存 | `UserScriptService.refresh()` 缓存启用脚本、文件内容、规则与启用站点；`UserScriptRuntime` 启动水合 values，按 frame URL 生成受限快照；脚本/站点变更先推进 generation 并清空旧缓存，刷新失败也保持空快照，使旧端口和旧写入权限 fail closed |
| preload 与端口 | `session.registerPreloadScript({ type: 'frame' })` 只注册一个固定 `userscriptBootstrapPreload`；每导航使用随机 nonce，隔离 preload 先装 listener，再以 `contextBridge.executeInMainWorld` 创建主世界闭包并通过一次性 `window.postMessage` 转移 DOM `MessagePort`；主进程按 webContents/frame process/routing ID 绑定并校验 sender、session、URL、generation |
| GM 语义 | 用户代码以独立 IIFE 执行；`GM_info`、`GM_addStyle`、`GM_get/set/delete/listValues`、`unsafeWindow` 与 `GM.*` aliases 只按 `@grant` 作为局部参数提供，`@grant none` 在主世界和主进程二次授权层都硬拒绝特权 API；values 按脚本 ID 隔离并通过专用端口落库；start/end/idle 先采用保守事件调度，精确时序证明归 B6.4 |
| shell 隔离 | `scripts:getAll` 改为只返回 `id/name/enabled/site_ids_json/has_file` 摘要，不再向 shell renderer 结构化克隆 `code` 或绝对 `file_path`；旧页面 `window.GM_*`、localStorage 和页面 fetch polyfill 已删除 |
| 测试 | B6.2 定向 `10 files / 53 tests` 通过；`npm run test:core` 通过：Vitest `80 files / 758 tests`、TypeScript、全仓 ESLint、architecture `7/7` 与 security 全绿；新增运行器 grant/IIFE/value 快照、start/end/idle 调度骨架、协议边界、frame/port 代际、`@grant none` 主进程拒绝、刷新失败闭锁、renderer 摘要安全与 IPC 合约测试 |
| 暂缓验证 | 按批量策略未运行生产 build、NSIS、真实 packaged 双实例 smoke；B6.4 负责真实 Electron 父 frame/iframe、reload stale port、站点捕获不到端口与 document-start 顺序 smoke |
| 视觉影响 | 仅调整脚本来源摘要字段，未修改主题、颜色、字体、按钮形态、布局或动画；前端视觉冻结保持不变 |
| 后续工作 | 进入 B6.3 主进程 `GM_xmlhttpRequest` 代理与 `@connect` 双重 URL 校验；B4.2-B4.6 继续等待 B6.1-B6.4 |
| 完成时间 | 北京时间 `2026-08-19` |

### 11.40 B6.3 受限网络代理与授权完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | `GM_xmlhttpRequest` 主进程代理、`@connect` 白名单与逐 host 授权、NoticeBar 回执、`GM_setClipboard`、`GM_registerMenuCommand`、`window.onurlchange` 及 OJ session 全局 CORS 清理 |
| 状态 | `[x] 已完成；B6.4 的真实 document-start/end/idle 时序、父 frame/iframe/reload smoke 与 B6.5 的 @require/@resource 下载/SRI 仍待后续` |
| Commit | `scripts: 完成 B6.3 受限网络代理与授权`（代码、测试、文档与完成标记同提交） |
| 网络边界 | `Session.fetch` 使用 `redirect: 'manual'`，初始 URL 与每一跳重定向都重新校验 HTTPS（开发态仅额外允许 loopback HTTP）、userinfo、当前脚本 `@connect` 和当前脚本精确 host 持久授权；父域声明只按 DNS label 匹配，实际授权永远保存目标精确 host |
| 资源限制 | 请求体、响应体、响应头、超时、重定向、全局并发与单端口并发均设硬上限；过滤 Cookie、Host、Origin、Referer、Content-Length、`Sec-*`、`Proxy-*` 等浏览器所有请求头，跨 origin 重定向额外移除 Authorization，响应不向脚本暴露 Set-Cookie |
| 授权链路 | `UserScriptHostPermissionBroker` 按窗口串行提示、同脚本/host 合并、拒绝与超时按 generation 负缓存；shell 仅接收 `promptId/scriptName/targetHost/sourceHost`，通过既有 NoticeBar 回应；允许前重新验证 generation、webContents 与当前 owner，标签过户、reload、关窗、generation 变化和异步校验竞态均 fail closed |
| GM 与菜单 | classic callback 和 modern Promise/abort 两套 `GM_xmlhttpRequest` 语义支持 `text/json/arraybuffer/blob/document`；`GM_setClipboard` 只写不读；脚本菜单命令按活动端口和 webContents 隔离，进入页面原生右键菜单的“用户脚本”子菜单；SPA 地址变化触发 `window.onurlchange`；`@grant none` 在主世界和主进程都硬拒绝 |
| CORS 与 stealth | 删除 OJ session 的全局 `onHeadersReceived` CORS 改写，跨域能力只存在于受限代理；HTML stealth 判定迁移到 `onResponseStarted`，保持主 frame 早期注入而不改写任何站点响应头 |
| 自动验证 | B6.3 定向类型检查、安全边界、运行时、UI/IPC、OJ session 与右键菜单测试通过；`npm run test:core` 通过：Vitest `85 files / 792 tests`、TypeScript、全仓 ESLint、architecture `7/7` 与 security 全绿；`npm run test:docs`、`npm run test:packaging` 和 `git diff --check` 通过 |
| 暂缓验证 | 按 B6 批量策略不运行生产 build、NSIS、真实 Electron 或 packaged 双实例 smoke；这些与 B6.4 的真实 frame/reload 时序一并集中执行 |
| 视觉影响 | 未修改 CSS、主题、颜色、字体、按钮形态、布局基调或动画；授权复用既有 NoticeBar，脚本命令复用原生右键菜单，前端视觉冻结保持不变 |
| 后续工作 | 进入 B6.4，证明真实 Electron 中 document-start/end/idle、父 frame/iframe、reload stale port 与站点无法捕获私有端口；B4.2-B4.6 继续等待 B6.4 完成 |
| 完成时间 | 北京时间 `2026-08-19` |

### 11.41 B6.4 用户脚本注入时序收口完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | 固定 frame preload 与 sandbox 兼容的预编译 catalog、`document-start/end/idle` 真实阶段调度、父 frame/iframe/noframes、SPA 重匹配与脚本更新/注销竞态收口 |
| 状态 | `[x] 已完成；B6.5 的 @require/@resource 本地缓存与 SRI、B6.6-B6.7 的安装更新及管理页仍待后续` |
| Commit | `scripts: 完成 B6.4 用户脚本注入时序收口`（代码、真实 Electron smoke、文档与完成标记同提交） |
| 注入时序 | 主进程按 generation 生成受限预编译 catalog，与固定 bootstrap 合并为一个 frame preload；sandbox preload 不再执行 `new Function`。Electron 43 的真实顺序为普通 webPreferences preload → userscript document-start → 页面内联脚本；document-start 仍早于页面脚本，普通 preload 之前的顺序标为 best-effort。`document-end` 以页面世界 `DOMContentLoaded` 为界，`document-idle` 由主进程 `did-finish-load`/`did-frame-finish-load` 通知 |
| frame 与后台页 | 主 frame 按 `webContentsId:processId:routingId` 维护独立端口和阶段状态；`@noframes` 在主进程快照阶段过滤。Electron 43 的 `session.registerPreloadScript({ type: 'frame' })` 在普通 iframe 中不触发，已由真实 smoke 记录为兼容边界；bridge 仍保留精确 child-frame key 与 idle 事件，后续升级 Electron 必须重新验证。阶段事件不依赖标签激活状态，后台页仍保持一致调度 |
| SPA 与动态权限 | `did-navigate-in-page` 重新计算当前 URL 快照，通过受限 `runtime:sync` 仅启动新匹配且尚未执行的脚本；移除的脚本立即中止其网络请求、清理菜单命令并拒绝后续特权消息 |
| stale guard | 运行时为每个脚本快照生成基于代码和权限合同的 revision，执行去重键同时包含 script ID 与 revision；每次缓存刷新推进 generation、主动发送 invalidate、关闭旧端口并取消未完成操作，延迟的 `document-end/idle` 不会在旧代继续执行 |
| 端口隐藏 | 不使用 `window.postMessage` 转交 DOM `MessagePort`。隔离 preload 只在随机 nonce 下短暂暴露 contextBridge send/subscribe 闭包，主世界运行器取得后立即删除桥接属性，再以私有端口和主进程通信；页面内联脚本无法捕获该端口或复用桥接入口 |
| 自动验证 | 单元测试覆盖阶段状态、SPA 同步、inactive 脚本收权、revision/generation 去重、旧端口失效和空匹配端口；`npm run test:electron` 新增真实 Electron localhost smoke，覆盖主 frame document-start/end/idle、页面无法捕获私有端口、SPA 重匹配、延迟 load stale generation 和 reload。iframe 运行时限制也作为 smoke 断言保留 |
| 兼容边界 | Electron 43 真实 smoke 证明 document-start 早于页面内联脚本，但晚于普通 webPreferences preload，且普通 iframe 不执行 session frame preload；因此 B6.4 对页面脚本时序交付精确兼容，对普通 preload 前置和 iframe 注入明确标记 best-effort。Electron 升级若改变任一行为，`test:electron` 必须先失败并重新评估 |
| 视觉影响 | 未修改 TSX、CSS、主题、颜色、字体、布局或动画；前端视觉冻结保持不变 |
| 后续工作 | B6.1-B6.4 安全与时序前置已闭合，可进入 B4.2 Vault/自动填充/登录捕获与 B6.5 资源缓存/SRI；两条后续链路仍需按计划独立验收 |
| 完成时间 | 北京时间 `2026-08-19` |

### 11.42 B4.2 CredentialVault 完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | `CredentialVault` DI 纯逻辑核心、异步 safeStorage、envelope/provider 校验、key rotation 重加密、结构化错误码与脱敏 IPC |
| 状态 | `[x] 已完成；B4.3 自动填充、B4.4 账户中心与 B4.5 登录捕获均已完成，B4.6 打包 fuses 仍待实施` |
| Commit | `credentials: 完成 B4.2 CredentialVault`（代码、测试、README、架构/安全文档与完成标记同提交） |
| Vault 边界 | `credentialVaultCore.ts` 通过依赖注入拆分纯逻辑；`CredentialVault.ts` 只绑定 Electron `safeStorage`；`save/list/delete/getForAutofill` 均已实现；系统加密不可用时拒绝保存/解密，不回退明文或应用主密码 |
| Envelope 与 rotation | 保存前异步加密并写入 V1 `electron-safe-storage` envelope；读取严格校验 version/provider/base64；Electron 返回 `shouldReEncrypt` 时按官方语义再次解密并使用当前 key 重加密旧记录 |
| Renderer 边界 | 壳 preload 只开放 `credentials:list` 与 `credentials:delete`；返回字段固定为 `credentialId/siteId/username/masked/时间`，密码、密文和 `getForAutofill` 结果不进入普通壳 IPC |
| 错误模型 | `CredentialVaultError.code` 提供 `invalid-input/encryption-unavailable/encryption-failed/decryption-failed/invalid-envelope/rotation-failed/storage-failed`，错误消息不携带密码、密文、Cookie、URL 或数据库路径 |
| 自动验证 | 定向 Vitest `3 files / 12 tests` 通过（Vault 安全逻辑、IPC 脱敏、IPC 合约）；TypeScript、敏感文件、architecture、docs、定向 ESLint 和 `git diff --check` 通过 |
| 视觉影响 | 未修改 TSX、CSS、主题、颜色、字体、按钮、布局或动画；前端视觉冻结保持不变 |
| 文档同步 | `electron/credentials/README.md`、`electron/ipc/README.md`、`electron/db/README.md`、凭据 repository README、`DATABASE_SCHEMA.md`、`SYSTEM_ARCHITECTURE.md`、`docs/README.md` 与安全边界同步 |
| 暂缓验证 | 按批量策略暂不运行生产构建、NSIS、真实 Electron safeStorage、登录页自动填充和 packaged 双实例 smoke；待 B4/B6 后续大块统一执行 |
| 后续工作 | 进入 B4.3：收敛站点登录配置并实现只填充不提交的 OJ 隔离 preload 通道；`getForAutofill` 是唯一主进程明文出口 |
| 完成时间 | 北京时间 `2026-08-19` |

### 11.43 B4.3 登录自动填充完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | DB `site_configs` 登录配置收敛、七站初始登录 URL/selector seed、跨拆分窗口自动填充协调器、OJ 隔离 preload 表单填充 |
| 状态 | `[x] 已完成；B4.4 账户中心与 B4.5 登录捕获均已完成，B4.6 打包 fuses 仍待实施` |
| Commit | `credentials: 完成 B4.3 自动填充`（代码、测试、autofill README、架构/安全文档与完成标记同提交） |
| 配置唯一源 | 新增 migration 028：`site_configs` 增加 `login_url_patterns_json`、`login_username_selectors_json`、`login_password_selectors_json`；`repositories/site/builtins.ts` 为 Codeforces、AcWing、牛客、VJudge、PTA、洛谷、LeetCode.cn 写入初始配置；删除零运行时引用的旧 `electron/sites/siteRegistry.ts`、`electron/sites/types.ts` 与 `electron/sites/builtins/` 副本 |
| 监听与窗口 | `CredentialAutofillService` 使用 `app.on('web-contents-created')` 并过滤 `persist:oj-main` session，不依赖 `TabManager` 活动标签查找，因此拆分窗口、标签过户和后台标签沿用同一协调器 |
| 安全边界 | 仅 HTTPS、无 userinfo、合法域名且命中登录 URL pattern；选择器长度/内容净化；多个凭据时 fail closed；`getForAutofill` 明文只经 `oj-credentials:fill` 到隔离 `ojPreload`；preload 二次校验当前 URL；只填用户名/密码，不自动提交 |
| 竞态处理 | dom-ready、did-navigate、did-navigate-in-page、destroyed 均有 generation/stale guard；异步解密返回到旧页面或 reload 后会被丢弃；SPA 延迟渲染支持短时重试并派发 input/change 事件 |
| 自动验证 | `npm run typecheck` 通过；变更文件 ESLint 通过；定向 Vitest `7 files / 26 tests` 通过（策略、协调器、Electron service、表单填充、migration 028、IPC 合约、parser 规则）；`git diff --check` 通过 |
| 文档同步 | `electron/credentials/autofill/README.md`、credentials/IPC/DB/site repository README、`DATABASE_SCHEMA.md`、`SYSTEM_ARCHITECTURE.md`、`SITE_ADAPTER_GUIDE.md`、`SECURITY.md`、`docs/README.md` 已同步 |
| 视觉影响 | 未修改 TSX、CSS、主题、颜色、字体、布局、按钮或动画；前端视觉冻结保持不变 |
| 暂缓验证 | 未运行生产构建、NSIS、packaged 双实例和真实七站登录页 smoke；真实站点 selector 需在具备测试账号/网络条件时逐站验收，不能由单元测试替代 |
| 后续工作 | B4.5 登录捕获已完成；进入 B4.6 打包层加固，继续保持壳 renderer 无密码明文 |
| 完成时间 | 北京时间 `2026-08-19` |

### 11.44 B4.4 账户中心与多凭据选择完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | 设置内部页账户中心、登录态安全摘要、凭据脱敏列表管理、Codeforces Handle/rating 绑定、登录页新标签更新密码和多凭据自动填充 NoticeBar |
| 状态 | `[x] 已完成；B4.5 登录捕获已完成，B4.6 打包 fuses 仍待实施` |
| 数据与 migration | 新增 migration 029 `site_credential_labels`，为 `site_credentials` 增加可选 `display_name`；repository/Vault 支持列表映射、重命名和空名归一化为 `NULL`，密码 envelope 与明文出口保持不变 |
| 账户中心 | `src/features/settings/CredentialsPage.tsx` 通过既有 settings/site/button/input 组件展示各站登录 Cookie 安全摘要、凭据数量、脱敏用户名/显示名/masked/最近使用时间、重命名、删除和“更新密码”新建 OJ web 标签；页面不提供密码输入或查看 |
| Rating 绑定 | 复用现有 Codeforces account/rating API，支持 Handle 绑定与 profile 同步，展示 current/peak rating；账户页不直接读取网页或 Cookie value |
| 多凭据选择 | `CredentialAutofillCoordinator` 在同站多凭据时暂停并请求选择；`CredentialAutofillService` 按壳 windowId 隔离 request，先登记 pending 再发送 prompt，30 秒超时、重复窗口请求、错误 requestId、非法 credentialId、窗口销毁和导航 generation 变化均 fail closed |
| renderer 边界 | 壳 preload 只接收 credentialId、siteId、username、displayName、masked、pageUrl 等脱敏字段；`credentials:autofillRespond` 只回传所选 credentialId 或 `null`；密码仍只经 `oj-credentials:fill` 到 OJ 隔离 preload，壳 renderer 永远不能收到密码明文 |
| 窗口与布局 | prompt 通过所属完整壳 NoticeBar 展示，`TabManager` 将凭据 NoticeBar 高度计入 web view bounds；响应、取消、超时和销毁后恢复原布局，拆分窗口复用同一全局自动填充监听 |
| 测试 | `npm run typecheck` 通过；定向 Vitest `6 files / 17 tests` 通过（Vault、协调器、service、credentials IPC、preload IPC 合约、credential repository）；新增 `siteCredentialLabelMigration.test.ts` 并纳入 `test:db`；补充账户中心静态安全边界、prompt owner 路由和 migration 幂等覆盖 |
| 文档与视觉 | 已同步 credentials/autofill、IPC、settings、browser、DB migration README、`DATABASE_SCHEMA.md` 与 `SECURITY.md`；沿用现有 class/token/component，未修改主题、颜色、字体、按钮形态、布局基调或动画，前端视觉冻结保持不变 |
| 暂缓验证 | 按批量策略本块未运行生产构建、NSIS、真实 packaged 双实例 smoke 或真实七站登录捕获；B4.5 已完成自动化边界覆盖，生产与真实站点验证继续留到 B4.6/B4 大块统一验收 |
| 后续工作 | B4.5 登录捕获已完成；进入 B4.6 打包层加固，继续保持密码只在主进程与 OJ 隔离 preload 之间流动 |
| 完成时间 | 北京时间 `2026-08-19` |

### 11.45 B4.5 登录捕获完成记录

| 字段 | 填写内容 |
|---|---|
| 任务 | OJ 隔离 preload 登录表单 submit 捕获、主进程短时 pending capture、脱敏 NoticeBar 确认、同名密码变化更新提示与 Vault 保存/覆盖流程 |
| 状态 | `[x] 已完成；B4.6 打包 fuses 与 packaged smoke 仍待实施` |
| 捕获边界 | `ojPreload` 只监听 submit，不阻止或代替页面正常登录；只从启用的用户名/密码字段提取数据，空值、disabled、readonly、hidden、非表单 target 和 malformed payload fail closed；密码只沿 `oj-credentials:capture` 从 OJ 隔离 preload 进入主进程，不进入壳 preload、renderer、日志、导出或截图 |
| 主进程流程 | `CredentialCaptureService` 过滤 `persist:oj-main`，复用站点配置校验 HTTPS、域名与登录 URL；同站点同用户名密码未变化时静默忽略，密码变化时标记 `isUpdate`；主进程先保存窗口级一次性 `captureId` 和短时 pending 明文，再向所属壳发送不含密码的站点/用户名/displayName/masked 摘要，确认后才写入 Vault |
| 清理与竞态 | `save`/`update`/`cancel` 必须匹配 prompt 状态并一次性消费 captureId；30 秒超时、导航、SPA 原位导航、WebContents 销毁、服务 `dispose` 和同窗口新捕获都会清除旧 pending；保存失败只发送 `save-failed` 非敏感结果，不返回密码、密文或异常详情 |
| Renderer 与布局 | 壳 renderer 只显示脱敏摘要和保存/更新/暂不保存操作；`credentials:capturePrompt`/`credentials:captureResult` 不含密码，`credentials:captureRespond` 只回传 captureId 与受限 action。提示复用既有 NoticeBar、组件、布局 token 和 `TabManager` 文档流让位逻辑 |
| 自动验证 | 表单提取、service 生命周期、owner/captureId/action 校验、同密码静默、密码变化更新、取消/超时/导航/销毁、保存失败、preload IPC 合约和 renderer 脱敏展示均纳入 B4.5 定向测试；`test:docs` 与 `git diff --check` 已通过，类型、lint、核心/DB/architecture/security 测试在本子块提交前统一执行并按实际结果补记 |
| 文档与视觉 | 已同步 credentials、IPC、browser、系统架构、安全规范与本计划；未修改主题、配色、字体、按钮样式、布局基调或动画，继续严格复用现有 class/token/component，前端视觉冻结保持不变 |
| 暂缓验证 | 按批量策略本块不运行生产构建、NSIS、真实 packaged 双实例 smoke 或真实七站登录捕获；这些验证留到 B4.6/B4 大块统一验收，不在本块虚报 |
| 后续工作 | 进入 B4.6：electron-builder fuses、生产 DevTools/启动 smoke 边界、asar/native SQLite 兼容和 packaged 双实例验证 |
| 完成时间 | 北京时间 `2026-08-19` |
