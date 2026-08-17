# 浏览器化壳层大重构计划（Browser Shell Refactor Plan）

> 状态：**已确认，待实施**（2026-08-16 起草并完成联网查缺补漏；决策点 D1-D30 已由用户拍板）
> 范围：窗口/浮层体系、标签页体系、拆分窗口、工具栏与交互、账户密码管理、视觉与动效
> 版本基线：`2.0.0-beta.2`，master @ `1190daf`（前端设计系统与全站视觉统一基线）
> 执行约束：后续功能重构必须保持 `1190daf` 的视觉语言、颜色、排版、组件形态与动效基调；除修复明确缺陷或计划列出的暗色/无障碍任务外，不做二次视觉改版。

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
- **覆盖率仍接近门槛**：在 `1190daf` 基线上重新实测为 28.91/34.66/24.60/29.63，对门槛 28/34/24/29 的余量分别仅 0.91/0.66/0.60/0.63pp。jsdom、Testing Library 与 `uiComponents.test.tsx` 已落地，`src/components/ui` 当前 100% statements/functions/lines，但绝大多数 feature TSX 仍为 0%；新增 UI 与 Electron 绑定模块仍必须测试同 PR 落地。
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
| B0.6 | 测试基建：jsdom + @testing-library 已由 `1190daf` 落地，本任务继续建立 electron test-double 基建，使 electron 绑定薄壳可在 node 下覆盖；Playwright 选择器迁 `data-testid`；给追踪/标题/脚本注入三条静默降级链路加诊断出口；TS7 下启用 eslint 核心 async 守卫，并跟踪 typescript-eslint 恢复类型感知规则 | `vitest.config.ts`、`eslint.config.js`、`tests/ui/`、`tests/` |
| B0.7 | **死资产清扫**：删遗留 `BrowserHost`、删 `public/home.html`（git 跟踪的零引用死页面）、`genericTableSites.ts`/`specializedScraperSites.ts` 两个仅测试引用的转发壳（测试改直连后删除）、`syncService.setBrowserHost` 改名 `setScrapeHost`（命名残留）；（已定 D7）删除 `submissions:detected`/`problem:detected` 死发送通道（SubmissionWatcher/main.ts/registerBrowserShellIpc 三处发送点与 ipcContracts internalChannels 清单同 commit 清理）；顺手修正 `electron/ipc/README.md` 未列 registerCoachIpc 的滞后 | `electron/browser/`、`electron/adapters/`、`electron/submissions/` |
| B0.8 | **主进程兜底与落盘日志（critical 修复）**：`process.on('uncaughtException'/'unhandledRejection')` 兜底 + `whenReady` 链 `.catch` + 致命错误 `dialog.showErrorBox` 后退出（消灭"僵尸进程"路径）；壳 webContents `render-process-gone` 自动 reload；引入落盘 logger（electron-log 或自研滚动文件），兜底/迁移/崩溃/五条追踪链路必须接入（111 处静默吞错不必全改，关键链路优先） | `main.ts`、新 `electron/shared/logger` |
| B0.9 | **单实例锁**：`requestSingleInstanceLock` 拿不到即 quit；`second-instance` 聚焦已有窗口（B3.5 扩展为路由到 WindowManager）——消除双开损坏 OJ 登录态分区与 config.json 互相清写的风险 | `main.ts` |
| B0.10 | **数据层先行修复**：统计重算 LIKE 改 >=/< 范围谓词 + 提交路径只重算本批涉及日期（实测 970ms→12ms，B2.5 omnibox 高频读 problem_visits 前必须治）；应用启动改为异步数据库初始化，检测 pending migration 后先使用 SQLite backup API 备份到 userData/backups并轮换保留 3 份；任一迁移失败须关闭数据库、原子恢复备份、写失败标记并退出，禁止同版本无限重试；problem_visits 孤儿行启动清理（按 entered_at 封闭并标记） | `db/connection.ts`、`db/migrate.ts`、`backup/`、`tracking/` |
| B0.11 | **脚本更新止血（G7 先行，用户最痛点，完整油猴化见 B6）**：migration **025_userscript_identity**；解析 @namespace，导入按 (namespace,name) 查重——已存在即覆盖更新（保留用户的 site_ids/enabled 配置）；@version 比较提示升级/降级；"另存副本"生成独立 local namespace 并默认关闭自动更新；文件副本命名改可辨认的 slug 形式；存量重复项迁移为一个 canonical + 若干 local copy；时间戳改为北京时间 | `userScriptMetadata`、`registerScriptsIpc`、`db/migrations/` |
| B0.12 | **壳信任边界（新增硬前置）**：ready 前注册 `app` privileged scheme，生产壳从 `app://shell` 加载并加严格 CSP；开发仅信任 Vite localhost；新增 `handleFromShell/onFromShell` 中央注册器，校验 sender、senderFrame、main frame、origin 与窗口归属，全部普通 IPC 必须迁入；OJ 提交、登录捕获、userscript bootstrap 分别使用专用 sender validator；安全测试覆盖远程 view、iframe、未知 webContents、伪造 origin 与畸形 payload | `appProtocol`、`ipc/trustedSender`、全部 IPC 注册器、security tests |

验收：快捷键（含缩放）在 OJ 页面焦点下全部生效；OJ 站内 `_blank` 链接开新标签且非 http/https 协议被丢弃；OJ 页面请求摄像头/定位被拒绝；比赛页在同标签导航、后台标签导航下均触发静默且退出比赛页解除；题目检测/访问追踪回归正常（防 B0.4 挂点破坏）；双击拆出已禁用且有"B3 回归"提示；kill 渲染进程后壳自动恢复；双开第二实例聚焦已有窗口；模拟 initDb 抛错弹出错误框而非静默退出；日志文件落盘可见；重算基准测试 <50ms；重复导入同一脚本=覆盖更新而非新建两行；`test:all` 绿。

### B1 设计系统（预计 6-10 小时）

> **当前基线（`1190daf`，状态 `[~]`）**：Button/IconButton、Input/Select/Textarea、Card、ConfirmDialog、统一 Icon、jsdom、Testing Library 与全站视觉统一已经落地。本阶段只补齐 Dialog/DropdownMenu/Toast/NoticeBar、无障碍、剩余 token 治理和明确缺陷；禁止重新设计现有页面。

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
| B2.5 | Omnibox + 工具栏收敛：输入解析内部路由/HTTPS URL/搜索三分流；默认 Bing，可选 Google/Baidu，自定义模板必须为 HTTPS 且仅含一个 `{query}`；建议只读本地 `problems`/`problem_visits`，不接远程联想；聚焦即摘 view 展示全区建议面板；工具栏继续沿用 `1190daf` 的视觉基线，只做功能收纳，不改颜色、排版、按钮外观与动效基调 | `BrowserToolbar` → `Omnibox`+`AppMenu`、`browser:omniboxSuggest` |
| B2.6 | Playwright 用例重写：`.modal-panel` 断言 → 标签页容器契约；6 页面流程改为标签导航流程 | `tests/ui/` |
| B2.7 | **Chrome 基线交互补齐**：`findInPage` 查找条；缩放按 normalized origin 记忆；DownloadManager 将普通下载写入受控下载目录，净化文件名、防目录穿越、处理重名并用 NoticeBar 反馈，`.user.js` 导航进入安装确认页；页面右键菜单见 **B2.8** | `TabManager`、`shortcuts/`、`downloads/`、`browser:findInPage`/`browser:setZoom` |
| B2.8 | **右键菜单体系（用户点名重点，一等交付物）**。统一走原生 `Menu.popup`（§4 三分法，零遮挡零延迟），一个 `contextMenus/` 模块集中定义全部菜单模板，杜绝散落。**① OJ 页面右键**（webContents `context-menu` 事件，params 提供 linkURL/srcURL/mediaType/selectionText/isEditable/editFlags，按上下文动态组装）：链接上=新标签页打开/复制链接地址（B3 起加"在新窗口打开"）；图片上=新标签页打开图片/复制图片/复制图片地址/图片另存为（走 B2.7 下载）；选中文本=复制/"使用 <搜索引擎> 搜索'…'"（联动 B2.5 omnibox 搜索引擎，新标签打开）；可编辑区=剪切/复制/粘贴/全选/撤销/重做（按 editFlags 动态置灰）；空白处=返回/前进/重新加载（置灰态跟随导航状态）。**② 标签右键**（Chrome 全集）：重新加载、复制标签页（duplicate）、移到新窗口（B3 启用）、关闭、关闭其他标签页、关闭右侧标签页、恢复关闭的标签页、复制网址。**③ 壳内编辑区右键**（笔记编辑器/设置输入框/omnibox 等 React 区域，壳 webContents 同一 handler）：剪切/复制/粘贴/全选；omnibox 额外提供 **"粘贴并前往"**（Chrome 特色）。**④ 内部页空白右键**：返回/刷新。**后续挂点**：B3 拆分入口（移到新窗口）、B6 脚本命令子菜单（与三点菜单双入口）。侧栏题目行右键（打开/新标签打开/详情/笔记）为可选加分项 | 新 `electron/contextMenus/`、`TabManager`、`TabStrip`、`Omnibox` |

验收：所有功能入口不再弹浮窗；设置/看板等以标签打开且可 Ctrl+W 关闭；omnibox 搜索与历史补全可用；查找/缩放/下载可用；**右键菜单专项验收——OJ 页面五种上下文（链接/图片/选中文本/编辑区/空白）分组正确、编辑区按 editFlags 正确置灰、选中文本可一键搜索、标签右键八项全可用、omnibox"粘贴并前往"可用、任何右键菜单不被 WebContentsView 遮挡**；截图替身代码与退役通道全删；`test:all` 绿。

### B3 多窗口对等壳与拆分（预计 15-21 小时）

⚠️ 任务序强约束：**B3.2 的服务语义（尤其 ContestGuard 多 TabManager 聚合、TrackingService 多订阅护栏）必须先于或与 B3.3 同 commit 落地**——否则多壳窗口会在服务语义就绪前上线，出现比赛硬闸空窗或单状态机互踩（ContestGuard `handleUrlChange` 是单流状态机，两窗口混流喂 URL 会互相清状态）。拆分入口（拖出/右键移到新窗口）在服务语义就绪前保持禁用。

| 任务 | 内容 | 涉及 |
|---|---|---|
| B3.1 | `WindowManager`/`AppWindow` 抽象 + IPC sender 路由化：WindowManager 持有 `Map<windowId, AppWindow>`，应用级 ViewRegistry 持有 `webContentsId -> windowId/tabId/view`；盘点全部 `getWindow`/`getParentWindow`/`getTabManager` 消费者，handler 必须经中央 trusted-shell 注册器从 sender 归属表解析窗口，禁止各 handler 自行猜测；事件推送各窗口发给自己；窗口 bounds/maximized 持久化 + 多显示器越界校验。本任务保持单窗口行为不变，可完整回归后再继续 | 新 `electron/windows/`、全部 IPC 注册器、`main.ts`、`windowBounds.ts` |
| B3.2 | 事件源 per-webContents 化：统一导航契约为 `{windowId, tabId, webContentsId, url, isMainFrame, reason}`，iframe 导航不得覆盖标签顶层 URL；did-navigate/dom-ready/page-title-updated/did-finish-load 直达消费者，一次修复访问追踪、标题、脚本、实时提交与 Coach 五条链路；ContestGuard 按 webContents 聚合并在销毁时清理；TrackingService 按 visitId 多流并行关闭；Coach 保守单会话跟随最近活跃窗口并防抖；tracking 写路径收进 repository，`deleteProblem` 包事务并重算涉及日期；所有链路接落盘诊断 | `TabManager`、`tracking/`、`scripts/`、`submissions/`、`coach/` |
| B3.3 | 拆分窗口 = 新建完整壳窗口 + `releaseTab`/`adoptTab` 过户；恢复标签拖出、右键"移到新窗口"、双击三种入口并支持拖回合并；传输过程使用 tab 锁，顺序固定为旧父摘除→旧 owner 释放→注册表换主→新 owner 接纳→新父挂载，任一步失败回滚；窗口 close 与拖拽竞态不得产生无主、重复挂载或已销毁 view；移出最后一个标签后源窗口自动关闭；删除 `DetachedWindow` + 退役 `tab:detach` 通道 | `windows/`、`TabManager`、`TabStrip` |
| B3.4 | 剩余服务多窗口化：`problems:updated` 广播全窗口；SessionTracker 聚焦判定改"任一本 app 窗口"；syncService 按窗口活跃 tab；（已定 D7）比赛模式横幅接 `coach:contestModeChanged` | `submissions/`、`coach/`、`tracking/` |
| B3.5 | 生命周期浏览器化：任一窗口可关（含最初主窗口）；关闭窗口显式销毁其仍拥有的 tabs，已迁出 tabs 不受影响；最后壳窗口关闭即退出，桌宠不维持进程且默认跟随最近活跃壳窗口；second-instance 聚焦最近活跃窗口；窗口/标签快照原子落盘，重启恢复全部窗口、激活项与合法 bounds；`startupSmoke`、ipcContracts 与泄漏测试同步更新 | `main.ts`、`app/startupSmoke.ts`、tests |

验收：拆出窗口有完整标签栏/工具栏/内部页能力；**拆分入口三种方式（拖出/右键/双击）全部可用——B0 的临时禁用在此正式解除**；原窗口关闭后拆分窗口一切功能正常（提交监测/追踪/脚本注入/比赛静默不降级）；两窗口分别处于比赛页/非比赛页时比赛模式判定正确（聚合不互踩）；从拆分窗口发起导入/导出对话框父窗口正确；标签可拖回；无 webContents 泄漏（关窗后进程数正确）；`test:all` 绿。

### B4 账户与密码管理（预计 14-18 小时）

> 安全前置：B0 的 app 协议/CSP/IPC sender 校验必须完成；B6.3 的最小主进程网络代理与全局 CORS 清除必须先落地，之后才允许启用登录捕获与凭据保存。

| 任务 | 内容 | 涉及 |
|---|---|---|
| B4.1 | migration **026_site_credentials**：id/site_id/username/secret_envelope/last_used_at/sync_excluded=1/时间戳（北京时间）/deleted_at，UNIQUE(site_id,username)；加密 envelope 显式带版本；repository 三件套；加入导出排除清单并如实列全未导出表；导出入口标注"完整备份请用数据库备份"；不变量测试覆盖密文、导出、软删和 migration 失败恢复 | `db/migrations/`、`db/repositories/credential/`、`backup/learningDataExport` |
| B4.2 | `CredentialVault` 按 DI 拆分：save/list/delete/getForAutofill；使用 `safeStorage.encryptStringAsync/decryptStringAsync`，支持 isEncryptionAvailable、key rotation/旧 envelope 重加密和结构化错误码；系统密钥环自动解锁，无应用主密码、无明文回退；壳 renderer 只见 credentialId/username/masked，OJ 隔离 preload 到主进程的受限内部通道是唯一允许传输登录明文的 IPC | 新 `electron/credentials/`、`registerCredentialsIpc`、`tests/security/` |
| B4.3 | 登录自动填充：**站点配置收敛为 DB site_configs 唯一源**（体检定性：SiteRegistry 创建即丢弃、cookiePolicy 全链零消费——"双源"实为"一源已死"；seed 补全写入 cookie_policy/patterns/adapter 后删除或降级 SiteRegistry，loginUrlPatterns 建在收敛后的单源上）；扩展 `loginUrlPatterns` + 表单选择器（内置七站逐站实测配置）；**监听挂点不走 TabManager 回调**（findTabByView/activeTab 门控会漏拆分窗口）——改挂 `app.on('web-contents-created')` 过滤 `persist:oj-main` 分区（或 createView 直挂裸 webContents dom-ready），天然覆盖所有窗口；**只填充不自动提交**（验证码普遍存在）；填充前严格校验 URL 属于凭据站点 domains | `sites/`、`credentials/autofill` |
| B4.4 | 设置内"账户"分区（内部页标签体系内）：整合登录态摘要 + 保存凭据列表（脱敏显示、删除、重命名、前往登录页更新密码）+ rating handle 绑定；不在壳 renderer 提供密码明文查看/编辑框；多凭据选择填充使用顶部 NoticeBar；顺手清理 mainServices 里创建即丢弃的 SiteRegistry/CookieVault 实例语句 | `src/features/settings/`、`app/mainServices.ts` |
| B4.5 | **登录捕获（Chrome 主路径）**：ojPreload 隔离世界监听登录表单 submit，仅把 username/password 直接送入主进程短时内存；主进程向壳发送不含密码的 captureId + 脱敏摘要，NoticeBar 确认后入 Vault，取消/超时/窗口关闭立即清空；已存在同名凭据且密码变化时提示更新；自动填充只填不提交 | `ojPreload`、`credentials/`、NoticeBar |
| B4.6 | **打包层加固**：直接使用 electron-builder `electronFuses` 配置：runAsNode=false、enableCookieEncryption=true、enableNodeOptionsEnvironmentVariable=false、enableNodeCliInspectArguments=false、enableEmbeddedAsarIntegrityValidation=true、onlyLoadAppFromAsar=true、grantFileProtocolExtraPrivileges=false；smoke preload 仅 STARTUP_SMOKE_MODE 可启用；生产 DevTools 禁用；打包测试读取 fuse 状态并验证 asarUnpack/native SQLite 兼容 | `electron-builder.json5`、`main.ts`、packaged tests |

验收：在 OJ 登录一次 → 通知条提示保存 → 重开登录页自动填好、点登录即可（拆分窗口内同样生效）；密码在 DB 中为密文、导出不含、日志无泄漏；safeStorage 不可用时保存被拒绝且有提示；打包产物 cookie 落盘加密、无法以 --inspect 附加；`test:security` 与 `test:packaged-app` 绿。

### B5 视觉收尾与打磨（预计 10-14 小时）

> **视觉冻结约束**：本阶段不是第二轮改版。所有布局、状态和动效补全必须复用 `1190daf` 已确定的 token、字体、色彩、圆角、阴影、组件和图标；禁止重新换主题、重画组件或扩大视觉 diff。允许的变化仅限浏览器化结构必需调整、暗色模式、无障碍、响应式缺陷与明确视觉 bug。

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
| B6.2 | GM 运行时重写：脚本以 IIFE 执行，GM API 仅作局部参数，不挂 `window.GM_*`；session 注册一个固定 userscript bootstrap preload，它从主进程内存缓存取得当前 frame 的匹配脚本和值快照；主世界脚本通过每次导航生成的私有 MessagePort 与隔离 preload 通信，桥不暴露给站点；shell renderer 永远不接收可执行源码 | `userscriptBootstrapPreload`、`userScriptInjector`、受限 GM 桥 |
| B6.3 | GM_xmlhttpRequest 主进程代理 + @connect 白名单：初始与重定向 URL 双校验，未授权域首次请求由所属窗口 NoticeBar 授权并按脚本持久化；响应补齐 finalUrl/headers/status/timeout/responseType；本任务前半段作为 B4 安全前置，完成后删除 `ojSession` 的全局 CORS 响应头改写；GM_setClipboard、GM_registerMenuCommand、window.onurlchange 同批接入 | 新 `scripts/gmProxy`、`contextMenus/`、NoticeBar |
| B6.4 | 注入调度重写：使用 `session.registerPreloadScript({ type:'frame' })` 让 bootstrap 早于普通 ojPreload；document-start 必须以真实页面内联脚本顺序测试证明，document-end=DOMContentLoaded，document-idle=did-finish-load；覆盖后台标签、iframe、noframes、SPA、脚本更新/注销竞态与 stale-version guard；若目标 Electron 版本无法通过顺序测试，明确标记为 best-effort，禁止声称精确兼容 | `ojSession`、`userscriptBootstrapPreload`、调度器 |
| B6.5 | @require/@resource 改为安装/更新时下载入库 + **SRI 校验**（URL #sha256/md5，多 hash 取最后受支持项——现状"解析时剥离丢弃"是安全缺陷）；注入时 @require 按序拼接在用户代码前同段执行（免站点 CSP、保证顺序）；GM_getResourceText 回缓存文本、GM_getResourceURL 回 data:/blob: | `scripts/installer`、资源缓存 |
| B6.6 | 安装与更新链路：拦截 `.user.js` 后先下载、解析、校验、缓存资源，再用数据库事务 + 临时文件原子替换，任一步失败保留旧版；确认页展示身份、版本、匹配域、grant/connect、antifeature 与版本 diff；更新链按 updateURL/downloadURL/lastInstallURL 回退，默认每 24h + 手动检查，使用 ETag/Last-Modified | `scripts/updater`、`scripts/installer`、TabManager 导航拦截 |
| B6.7 | 管理页升级与安全收口：代码只读查看 + 系统编辑器打开 + watcher；重复导入提供更新现有/另存本地副本/取消，本地副本使用独立 namespace；启停、更新、删除必须同步刷新主进程缓存并注销旧版本；脚本源码不进日志，OJ bootstrap 之外的 renderer 不接收源码；提交桥加每导航随机 token | `src/features/scripts/`、`ojPreload`、`tests/` |

明确不做/降级（写入脚本页说明，画像中使用率各 ≤1 或 0）：GM_webRequest、GM_cookie、GM_getTab 族、GM_download（降级为主进程 dialog 下载）、@sandbox DOM 隔离世界（首版全部主世界=TM raw 默认；Electron executeJavaScript 不受站点 CSP 限制）、脚本云同步。

验收：Greasy Fork 脚本页点"安装此脚本"→ 应用内确认页 → 安装成功；重复安装同脚本=覆盖更新且保留启停/站点配置；"检查更新"能把旧版 Codeforces Better! 升到新版；画像 Top 脚本实测可用清单 ≥5 个（Codeforces Better!/CF-Predictor/LeetCodeRating 等，覆盖 GM_xmlhttpRequest/@connect/GM_addStyle/GM 值/document-start 各路径）；GM 值持久且站点 JS 无法读取；@connect 未授权域请求被拦截并弹授权；后台标签与 iframe 注入生效；`test:all` 绿。

### 预计总量

查缺补漏后的净协作编码时长约 **115-165 小时**；按每天 4-6 小时协作节奏约 **5-8 周**。每个任务开工时仍需给出单项预计用时。强制顺序为：B0 安全/数据地基 → B1 补齐与 B2 标签壳 → B3 多窗口 → B6.1-B6.4 网络与早注入边界 → B4 凭据 → B6 剩余兼容与 B5 收尾。B4.5 不得先于 B6.3 的全局 CORS 清除上线。

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
10. **前端视觉冻结**：`1190daf` 是后续重构的视觉基线。除暗色模式、无障碍、响应式缺陷和明确 bug 外，禁止更换色板、字体、圆角、阴影、组件外观、图标体系与动效基调；浏览器化只调整信息架构、布局占位和交互，不另起视觉方案。每次涉及 TSX/CSS 的任务必须附视觉 diff 说明，若无计划内视觉变化应明确记录“视觉无变更”。

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
5. `git diff` 不包含任务外重构；前端视觉遵守 `1190daf` 冻结基线。
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
| B0.7 | [ ] | 死资产与死 IPC 清理待实施 |
| B0.8 | [ ] | 主进程兜底与落盘日志待实施 |
| B0.9 | [ ] | 单实例锁待实施 |
| B0.10 | [ ] | 数据性能、迁移备份/恢复、孤儿 visit 清理待实施 |
| B0.11 | [ ] | 025_userscript_identity 待实施 |
| B0.12 | [x] | `a004d3c`（2026-08-16）：生产壳迁移至 `app://shell` 并启用严格 CSP；普通 IPC 统一接入 shell sender/main-frame/origin/payload 校验，OJ 提交通道使用专用 HTTPS sender validator；TabManager 管理 OJ sender 生命周期；安全、架构、IPC 合约与真实 Electron startup smoke 覆盖已完成；全量验证通过；无视觉变更 |
| B1.1 | [~] | `1190daf` 已统一主要 token；暗色双值与剩余域核对待完成 |
| B1.2 | [~] | Button/fields/Card/ConfirmDialog 已落地；Dialog/DropdownMenu/Toast/NoticeBar 待补 |
| B1.3 | [~] | Icon 组件已落地；全仓遗留 Unicode/emoji/内联图标核对待完成 |
| B1.4 | [x] | `1190daf`；`rg` 确认 src 中无原生 confirm；组件测试已覆盖 ConfirmDialog |
| B1.5 | [~] | 主要 feature 已视觉统一；`@milkdown/theme-nord` 仍在 package.json，桌宠独立颜色与剩余 token 待治理 |
| B2.1-B2.8 | [ ] | 标签模型、内部页、截图机制退役、TabStrip、Omnibox、UI 测试、下载/查找/缩放、右键菜单均待实施 |
| B3.1-B3.5 | [ ] | WindowManager、事件多窗口化、标签过户、服务广播、生命周期与恢复均待实施 |
| B4.1-B4.6 | [ ] | 026_site_credentials、Vault、自动填充、账户页、登录捕获、fuses 均待实施 |
| B5.1-B5.6 | [ ] | 仅按视觉冻结约束做结构收尾、暗色、无障碍、桌宠策略和 Latex |
| B6.1-B6.7 | [ ] | 027_userscript_runtime、GM 桥、网络代理、早注入、资源、安装更新与管理页均待实施 |

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
