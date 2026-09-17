# AI 交接记录

> 本文件记录 AI 助手之间的工作交接状态，便于后续 AI 快速了解当前进展与待办事项。

## 最近完成（2026-09-17）

### Trellis 初始化与规范对齐审计

- 引入 Trellis 工作流（`.trellis/`、`AGENTS.md`、`.agents/`、`.codex/`、`.grok/`），spec 采用 electron-fullstack 官方模板并保持原文未改；激活任务 `00-bootstrap-guidelines`。
- 新建 `dev` 分支并在其上提交；此前 248 个 commit 全部直接落在 master。后续开发在 dev / feature 分支进行，master 只接收合并。
- 以模板规范为基准完成三份只读审计（主进程、渲染进程、测试/工具链/仓库/Git），合并为 `.trellis/tasks/00-bootstrap-guidelines/research/spec-alignment-report.md`：高优先级 9 条（IPC channel 字面量 158 处、跨进程类型三处手抄、`main.ts` 945 行、超长核心文件、时间格式在约定内混用、dev/prod 共用 userData、15 个组件不订阅刷新、无工具门、无分支模型），中 23 条，低 22 条；亮点 10 条。
- 分阶段对齐计划在 `research/spec-alignment-plan.md`：阶段 0 建门（分支保护 + commitlint/husky + 类型棘轮，typescript-eslint 因 TS 7 不兼容改用架构守卫正则）→ 1 核心稳定性 → 2 IPC 契约收口 → 3 主进程拆分 → 4 渲染层结构 → 5 测试细节 → 6 spec 落地，约 19–25 个工作日。
- 开发者决策：**模板是唯一标准，不为旧习惯保留**。计划改为 v2（D1–D23 决策：TS 降到 5.9 + typescript-eslint、pnpm、prettier、husky/commitlint、zod 替换 payloadSchema、electron-log 替换自研 logger、electron-store 替换 config.ts、Drizzle 替换裸 SQL、时间改 Unix 毫秒、目录改 `src/main|preload|renderer|shared`、文件 kebab-case、BEM、`window.api`），7 阶段约 38 个工作日。
- 重复造轮子审计 `research/reinvented-wheels-audit.md`：jscpd 重复率 1.76%（健康），真正的问题是 6 个自研基础设施模块约 1,600 行可被库替代，以及 `tabSessionStore` / `applicationSessionStore` 522 行双胞胎。
- spec 落地：模板文件一字未改；新增 `.trellis/spec/project/{index,domain-rules,git-workflow,migration-status}.md` 并从 `spec/README.md` 链接。`.gitignore` 不再忽略 `.claude/`（Trellis 的 hooks/skills/agents 需入库），只忽略 `settings.local.json`。
- 本次未改任何业务代码。下一步：归档 bootstrap 任务，按阶段 0 建子任务开工。

## 最近完成（2026-09-11）

### 项目审计第一批

- 用户在清单之后要求“开始”，本批执行备份、笔记、导入和数据统计审计；总并发保持 2（主代理加 1 个子代理）。
- 新增 [第一批报告](docs/OPERATIONS/PROJECT_AUDIT_BATCH1_2026_09_11.md)：8 项确认问题，2 项 P1、5 项 P2、1 项 P3，均未修复。两项 P1 为备份遗漏笔记图片和保存失败仍显示“已保存”。
- 独立真实 Electron/SQLite 复现完成 8 个异常场景、1 个事务回滚通过场景；真实笔记面板组件加编辑器/IPC 替身复现保存 `false` 后显示成功及重开旧正文。源码为 `tests/db/auditDataIntegrity.repro.ts`、`tests/components/auditNoteSave.repro.tsx`，各目录有 `runAudit*.mjs` 入口。
- 结果位于 `algo-electron/tmp/audit-20260911/`，均为隔离合成数据；临时 profile 与 JSON 不入 git，报告保留关键值。`.repro` 脚本断言当前异常，不能当作正确行为的默认回归测试；修复时转换断言。
- 独立只读复核已校准影响：正文可从 DB 备份恢复，图片不可；路径只能控制父目录和随机 UUID 文件；软删除错误需要导入 tombstone；空笔记标题问题为 P3。
- OJ 后代 frame 转发与凭据删除/解密轮换竞态仍是 2 条未验证线索。安全子任务的跨源动态复现被自动审核拦截，实验未执行，脚本已撤除；不得写成已确认远程越权或凭据泄漏。
- 新增审计代码的测试 TypeScript 和定向 ESLint 通过；现有备份导入专项在真实 Electron Node 下 11/11 通过，文档与 diff 检查通过。未重跑全量业务测试、真实 UI/安装/OJ 验证；全项目 157 项清单尚未完成，下一批见报告第 5 节。
- 本次只新增审计脚本和文档，没有改业务代码、提交或推送。

## 最近完成（2026-09-08）

### 项目问题排查清单

- 用户要求先调查“能查哪些问题、怎么查”，再形成详细清单；本阶段未修改业务代码或实施缺陷修复。
- 新增 [PROJECT_AUDIT_CHECKLIST](docs/OPERATIONS/PROJECT_AUDIT_CHECKLIST.md)，包含 14 类、157 个检查项、11 条初查线索、验证场景/规模、优先级、证据模板和本轮实际检查结果；已加入文档索引。
- 初查发现备份范围与“完整备份”提示不一致，以及笔记双写、导入资源限制、LLM 缓存等待验证线索。官方 npm audit 报告两个受影响的间接开发依赖，生产依赖审计为零；未将公告评级直接认定为应用可利用漏洞。
- 2026-09-05 本轮执行的 TypeScript、Lint、架构/安全/文档/打包配置、Vitest 169 文件/1362 测试、DB、Electron smoke、renderer bundle 检查通过；完整 UI/覆盖率/AI/safeStorage/生产打包未在这次清单调查中重跑。交付时文档检查通过，详细边界以清单为准。
- 后续逐项排查时记录“线索/确认/通过/受阻”和复现证据，不能把清单项当作已确认问题。用户要求代理总并发最多 2，即主代理加 1 个子代理。
- 本次未提交、未推送。

## 最近完成（2026-09-05）

### RC 缺陷修复

- 笔记标签按 tabId 与 problemId 隔离组件身份；跨题切换保留原笔记待提交修改，新题不会继续写旧 noteId。
- Coach 异步提示与聊天校验请求生命周期；比赛、切题、换窗、页面销毁、停止后丢弃过期返回，演示 IPC 同样执行比赛保护。
- JSON 合并导入在同一事务内重建题目状态、首次 AC 和受影响日期的统计；同 ID 更新也进入冲突确认。
- 桌宠依据真实交互区域控制原生穿透，空白、气泡消失和缩放结束重新判定，拖拽保留捕获；最小化遵守用户置顶模式。
- README、package-lock 与版本规划统一为 `2.0.0-rc.1`；本轮变更留在 CHANGELOG“未发布”，未新增发布标签。

### 本轮验证

定向组件、Coach/IPC、SQLite 备份与仓库测试均已通过。完整验证已完成：生产与测试 TypeScript、全量 ESLint、架构/安全/文档/打包检查、全量 Vitest（含覆盖率）、SQLite/AI/safeStorage、Renderer 性能、Electron 启动、userscript/OJ bridge smoke、生产构建均通过；Playwright UI 9/9 通过（含透明桌宠原生穿透、三种视口页面、标签拖拽和切换动画命中测试）。本轮没有新增发布标签、提交或推送。IPC 与导入变更已由另一位审查者独立复核。

### 剩余验收

- 真实 OJ 登录与提交、多屏/DPI 下跨应用鼠标与桌宠拖拽、Windows 安装升级卸载仍需人工验收。
- 每日提示升级额度目前为进程内计数，重启会清零；本轮未改变额度产品策略。
- JSON 日统计快照仍参与既有冲突确认；确认后按最终事实重算，重复覆盖不会重复累计记录或时长。

## 历史完成（2026-09-01）

### B5.2 空态/加载态词汇全局统一

**完成时间**: 2026-09-01  
**提交**: 1f6ab81

**核心产物**:
- `Empty`/`Skeleton`/`ListRow` 三原语组件（`src/components/ui/states.tsx` + `ListRow.tsx`）
- 12 个异步界面统一三态模式（`T[] | null`：null=加载中, []=空, 非空=有数据）
- 题库侧栏折叠/展开改为单根 DOM + 宽度过渡动画

**覆盖界面**:
1. Dashboard 学习统计（总题数等四张卡 + 四个列表）
2. 首页今日练习
3. 题库侧栏（含筛选后无结果）
4. Coach 指标时间轴
5. 笔记列表
6. 笔记编辑器懒加载
7. 地址栏建议
8. 题目详情
9. 平台登录态
10. 脚本管理
11. 内部页切换占位
12. 设置页 Coach 配置

**测试**:
- `tests/components/asyncStatePrimitives.test.tsx`（14 条原语测试）
- `tests/components/asyncStateSurfaces.test.tsx`（11 条界面契约测试）
- 视觉回归 7 项全绿

**文档**: §11.56

### B5.3 全局动效完备

**完成时间**: 2026-09-01  
**提交**: 1f6ab81（与 B5.2 合并提交）

**核心产物**:
- View Transitions API 能力检测与内部页切换淡入淡出
- Dialog/Dropdown/Toast 双向出入场动画（@starting-style + transition-behavior: allow-discrete）
- 标签新建/关闭/激活对应动画（View Transitions 驱动）
- 全局 hover/focus-visible 状态完备性（按钮/输入框/可点击行）

**测试**:
- `tests/components/transitions.test.tsx`（7 条 View Transitions + Dialog 动画测试）
- `tests/components/hoverFocusCompleteness.test.tsx`（4 条交互状态测试）

**文档**: §11.57

### 桌宠 follow 档置顶振荡修复

**完成时间**: 2026-09-01
**提交**: 801310d

B5 验收中暴露的真机 bug：桌宠持续闪烁、点不动拖不动、主窗口任务栏按钮反复闪。

**根因**（不是重复调用，是振荡回路）:
- `follow` 档决策是"壳是否聚焦"的纯函数
- 落地决策要调 `setParentWindow()`，它在 Windows 上改 owner 关系并**会扰动焦点**
- "聚焦→绑 parent→扰焦→失焦→解绑→扰焦→聚焦"首尾相接

**修复**: 失焦延后 `BLUR_DETACH_VERIFY_MS = 120ms` 复核 `isFocused()` 事实再解绑；聚焦是安全方向立即生效并撤销在途复核。判据是持续时间——自扰动的失焦一两帧内被抵消，真原生菜单持续几百毫秒。

**为何测试没拦住**: `electronMock` 的 `setParentWindow` 是纯 setter，既不发 focus/blur 也让调用次数不可观测，振荡在 1299 条全绿下存活，两轮错误修复都没被判错（第二轮还加重了症状）。已加调用计数并写进 `tests/README.md` §4。

**文档**: §11.58

## 历史状态（B5 验收）

### B5.1-B5.6 总览（全部验收通过）

| 子任务 | 状态 | 记录位置 |
|--------|------|----------|
| B5.1 设置页分区导航 | ✅ 完成 | §11.54 |
| B5.2 空态/加载态词汇统一 | ✅ 完成 | §11.56 |
| B5.3 全局动效 | ✅ 完成 | §11.57 |
| B5.4 暗色模式 | ✅ 完成 | §11.55 |
| B5.5 桌宠置顶三模式 | ✅ 完成 | §11.52 |
| B5.6 Latex 公式支持 | ✅ 完成 | §11.53 |
| 桌宠振荡修复 | ✅ 完成 | §11.58 |

**`BROWSER_SHELL_REFACTOR_PLAN.md` 账本已无 `[ ]` / `[~]` 条目，无剩余"待填"。**

### 技术债务

无新增技术债务。

### 架构守卫状态

- typecheck: ✅ 通过
- lint: ✅ 通过
- 架构守卫: ✅ 0/17 失败
- 测试: ✅ 1299 条全通过
- 视觉回归: ✅ 7 项全绿

## 历史待办（2026-09-01）

浏览器壳重构计划（`docs/DESIGN/BROWSER_SHELL_REFACTOR_PLAN.md`）已全部收口，无剩余待办。后续工作由用户指定。

### 值得留意的欠账

- **累积改动的实机验证**：用户在 B5 验收时指出"好多累积的东西都没有人工测试"。桌宠振荡（§11.58）就是这类欠账被翻出来的第一例——它在 1299 条全绿测试下存活了下来。窗口层级、焦点、原生集成类改动尤其不能只看测试颜色。
- **`test:all` 未在本轮跑全**：本轮验证跑了 typecheck / lint / 全量 vitest（1305 条）/ test:architecture。`test:ui` 在 B5.2+B5.3 时跑过 7 项全绿，桌宠修复只动主进程未再跑。打包与 Electron smoke 未在本轮触发。

## 注意事项

### 必须遵守的约束

1. **Git 身份**: 只用 `xuper <dr.xuoer@gmail.com>` / GitHub `xuoer-xuper`，不加 `Co-Authored-By` trailer
2. **推送权限**: 明确要求才 push，否则只 commit
3. **工作目录**: 直接在 `D:\Algo-Learning-Platform\` 修改，不用 worktree
4. **时间处理**: 数据库时间用北京本地时间，不用 UTC
5. **Cookie 规则**: 不写日志、不进 Renderer、不进导出、不进 sync_queue
6. **架构边界**: Renderer 不得直连 SQLite/Cookie/文件系统

### 项目工作流程

每次任务：
1. 开工前读相关文档，声明预计用时
2. 编码遵循现有风格与约定
3. 修改 IPC/数据库需走审查流程
4. 结束后更新 PROMPT.md（若有新模式）
5. 更新相关文档（架构/接口/版本）
6. 给出 commit 消息（中文，按约定格式）
7. 更新本文件（AI_HANDOFF.md）

### 测试要求

- 修改组件必须有单元测试
- 修改 IPC 必须有 contract 测试
- 视觉变更必须通过 `npm run test:ui`
- 全量验证: `npm run test:all`

## 参考文档

- 完整开发流程: `C:\Users\drxuo\.claude\projects\D--Algo-Learning-Platform\memory\project_workflow.md`
- 核心规则: `C:\Users\drxuo\.claude\projects\D--Algo-Learning-Platform\memory\project_rules.md`
- 检查清单: `C:\Users\drxuo\.claude\projects\D--Algo-Learning-Platform\memory\dev_checklist.md`
- 重构计划: `docs\DESIGN\BROWSER_SHELL_REFACTOR_PLAN.md`
- UI 组件库: `algo-electron\src\components\ui\README.md`
