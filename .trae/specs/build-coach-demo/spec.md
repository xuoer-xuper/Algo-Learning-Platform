# AI Coach 初赛 Demo Spec

## Why

1.0 已完成，需要在初赛中用一个可演示的 Demo 证明 AI Coach 的核心价值：**不是套壳 GPT，而是本地规则引擎 + 合规硬保障 + 过程数据资产 + 视觉差异化**。本 spec 精选 TASKS.md 中 M1/M2/M3/M9 的核心任务，构成一个可在初赛现场演示、可离线运行、可证明有效的最小子集，为复赛扩展留接口。

## Demo 范围边界

### Demo 必做（4 个阶段，按依赖顺序）

| 阶段 | 来源里程碑 | 核心任务 | 演示价值 |
|---|---|---|---|
| 阶段 1：桌宠视觉壳 | M1 | T1.1-T1.4 | 视觉差异化，第一印象 |
| 阶段 2：事件触发 + 比赛模式 | M2 | T2.1-T2.6 | 合规红线 + 核心功能 |
| 阶段 3：通用提示 + 靶向提示 | M3 | T3.1-T3.5 | 零 LLM 也能用，评委眼中"真技术" |
| 阶段 4：过程复盘 + 答辩数据 | M9 | T9.1 + T9.4 | 过程数据资产 + 效果可证明 |

### Demo 不做（留复赛）

- M4 代码分析入口（依赖 LLM）
- M5 形象自定义（用内置模板即可演示）
- M6 LLM Provider（默认关闭，不影响 demo）
- M7 知识库/RAG
- M8 复赛创新（C1-C8 候选点）
- M9.2 虚拟赛复盘、M9.3 教练周报

### Demo 核心叙事（5 句话）

1. "不是套壳 GPT" —— 本地规则引擎 + Socratic Ladder + 白盒证据
2. "合规" —— 比赛模式硬保障 + 审计日志可导出
3. "有效" —— 干预效果指标页用数据说话
4. "过程数据资产" —— 单题时间轴复盘，内嵌浏览器独有
5. "视觉差异化" —— 类 Codex 科技感桌宠，不是聊天框

## What Changes

### 阶段 1：桌宠视觉壳（M1）

- 新增 Electron 透明悬浮窗 `electron/coach/CoachPetWindow.ts`，复用主窗口 `preload.mjs`，hash 路由 `#/coach-pet` 分流。
- 新增 React 渲染层 `src/features/coach/CoachPet.tsx` + `petStates.ts` + `pet.css`，SVG + CSS 实现科技感小人，6 种状态（idle/thinking/alert/celebrate/sleep/focus）。
- 新增气泡与交互按钮 `CoachBubble.tsx` + `CoachActions.tsx`，3 个默认按钮（给一点提示 / 先不用 / 今天别提醒）。
- 新增设置面板 `src/features/settings/CoachPanel.tsx`，开关 + 位置/缩放/透明度 + 测试提示按钮，配置沿用 `electron/app/config.ts`。
- 入口接入 `electron/main.ts`。

### 阶段 2：事件触发 + 比赛模式（M2）

- 新增 `electron/coach/types.ts`：`CoachEvent` + `ProblemSession` + `CoachIntervention` 类型。
- 新增 `electron/coach/ProblemSessionTracker.ts`：三态计时（读题/写码/卡壳），结合主窗口 focus/blur + `powerMonitor.getSystemIdleTime()`，挂机不计时。
- 修改 `electron/submissions/SubmissionWatcher.ts`：增加主进程侧 EventEmitter 出口，不改抓取逻辑。
- 新增 `electron/coach/CoachEventBridge.ts`：订阅提交事件 + `problem:detected`，转为 CoachEvent。
- 新增 `electron/coach/rules/RuleEngine.ts` + `rules.ts`：规则表 + 评分 + 节流 + 难度自适应阈值 + 防 hint abuse 冷却。
- 新增 `electron/coach/ContestGuard.ts`：URL 规则 + 时间窗判定，比赛模式硬关闭规则引擎与 LLM 通道，审计日志写入 `coach_interventions`。
- 新增 `electron/ipc/registerCoachIpc.ts`，接入 `registerMainIpc.ts`，暴露 `preload.ts`。
- 新增数据库迁移 `022_coach_events.ts` / `023_coach_interventions.ts` / `024_coach_feedback.ts`，加入 `connection.ts`。

### 阶段 3：通用提示 + 靶向提示（M3）

- 新增 `electron/coach/hints/hintTemplates.ts`：≥30 条内置 TS 模板，9 类（复杂度/边界/数据范围/初始化/溢出/输入输出/特判/越界/循环）。
- 新增 `electron/coach/hints/HintSelector.ts`：verdict → 提示类别映射。
- 新增 `electron/coach/hints/HintLadder.ts`：6 级 Socratic Ladder，概念/标签置于最高层 + 二次确认 + 升级冷却。
- 新增 `electron/coach/CoachFeedbackStore.ts`：反馈持久化到 `coach_feedback` 表，影响后续频率。
- 新增 `electron/coach/problemFacts/ConstraintParser.ts`：内嵌浏览器注入脚本抽取题面约束（数据范围/时限），verdict 联动靶向提示，解析失败静默退化。

### 阶段 4：过程复盘 + 答辩数据（M9 精选）

- 新增 `src/features/coach/SessionTimelineView.tsx`：单题时间轴复盘（进入题目 → 提交序列 → Coach 介入点 → AC/放弃），数据全部来自现有 `problem_visits` / `submissions` / coach 表。
- 新增 `src/features/coach/CoachMetricsView.tsx`：干预效果指标页（提示展示数 / "再给一点"点击率 / "有帮助"反馈率 / 干预后同题 AC 转化率 / 桌宠关闭率），基于 `coach_feedback` + `coach_interventions` 聚合。
- 新增路由入口与导航。

### 跨阶段基础设施

- 新增 `electron/db/repositories/coach/` 目录与 repository。
- 新增 `src/features/coach/` 目录。
- 文档更新：`electron/coach/README.md`。

## Impact

- **Affected specs**：无（首个 spec）。
- **Affected code**：
  - 新增：`electron/coach/`、`src/features/coach/`、`electron/ipc/registerCoachIpc.ts`、`electron/db/repositories/coach/`、`electron/db/migrations/022-024_*.ts`。
  - 修改：`electron/main.ts`（初始化 Coach 服务）、`electron/ipc/registerMainIpc.ts`（接入 Coach IPC）、`electron/preload.ts`（暴露 Coach API）、`electron/submissions/SubmissionWatcher.ts`（增加主进程出口）、`electron/db/connection.ts`（注册新迁移）、`src/App.tsx` 或路由（新增 `/coach-pet` / 时间轴 / 指标页路由）、`src/features/settings/SettingsPage.tsx`（接入 Coach 面板）。
  - 不修改：核心事实表（submissions / problem_visits / activity_events / user_daily_stats）schema，只读取。

## ADDED Requirements

### Requirement: 科技感桌宠视觉壳

系统 SHALL 在桌面上常驻一个透明、置顶、可点击穿透的 BrowserWindow，渲染类 Codex 科技感小人，支持 6 种状态切换与气泡交互。

#### Scenario: 启动应用后桌宠出现

- **WHEN** 用户启动应用
- **THEN** 桌面出现一个透明悬浮窗口，显示 idle 状态的科技感小人
- **AND** 不影响主窗口使用
- **AND** 桌宠不出现在任务栏

#### Scenario: 状态切换可观察

- **WHEN** 后端规则引擎触发 alert 事件
- **THEN** 桌宠在 1 秒内切换到 alert 状态
- **AND** 配色与动画明显变化

#### Scenario: 气泡交互

- **WHEN** 桌宠弹出气泡提示
- **THEN** 气泡显示标题、消息、来源标记（本地/LLM）
- **AND** 提供"给一点提示"/"先不用"/"今天别提醒"三个按钮
- **AND** 点击后向主进程发 IPC 并记录反馈

#### Scenario: 点击穿透与交互互斥

- **WHEN** 鼠标移入桌宠非交互区域
- **THEN** 鼠标事件穿透到下层窗口
- **WHEN** 鼠标移入气泡/按钮区域
- **THEN** 穿透临时关闭，按钮可点击
- **WHEN** 鼠标移出
- **THEN** 穿透恢复

### Requirement: ProblemSession 三态计时

系统 SHALL 维护当前题目会话，区分读题/写码/卡壳三态，只累计有效活跃时间，挂机不计时。

#### Scenario: 切到本地 IDE 不虚增时间

- **WHEN** 用户在题目页活跃后切到本地 IDE
- **THEN** session 挂起保持，不立即关闭
- **AND** `active_seconds` 不再增加
- **WHEN** 用户回到题目页或提交
- **THEN** 同一 session 继续

#### Scenario: 挂机不计时

- **WHEN** 主窗口失焦且系统空闲时间超过阈值
- **THEN** `active_seconds` 不增加
- **WHEN** 用户恢复操作
- **THEN** 重新计时

#### Scenario: 难度自适应阈值

- **WHEN** 当前题 rating ≥ 1600
- **THEN** `idle_too_long` 阈值放宽到 20-30 分钟
- **AND** 卡壳判定宁可漏报不误报

### Requirement: 提交结果订阅

系统 SHALL 订阅 `SubmissionWatcher` 的主进程出口，将每次提交结果转为 CoachEvent，不改抓取逻辑。

#### Scenario: 提交后 Coach 感知

- **WHEN** 用户在 CF/洛谷提交并收到 verdict
- **THEN** `CoachEventBridge` 收到事件
- **AND** 转为 CoachEvent
- **AND** 同题 WA ≥ 2 触发 `multiple_wrong`
- **AND** 同题相同 verdict 重复触发 `same_error`

### Requirement: 本地规则引擎

系统 SHALL 根据事件 + 会话判断是否触发干预，规则可配置、可禁用、有节流、有防 hint abuse 冷却。

#### Scenario: 节流

- **WHEN** 同类型事件 30 分钟内已触发
- **THEN** 不重复触发

#### Scenario: 防 hint abuse

- **WHEN** 用户在 2 分钟内连续点"再给一点"
- **THEN** 升级被冷却拒绝
- **OR** 需一次新提交才能解锁下一级

### Requirement: 比赛模式硬保障（ContestGuard）

系统 SHALL 在检测到 rated 比赛进行中时硬关闭规则引擎与 LLM 通道，桌宠切换到"比赛模式"状态，审计日志可导出。此为上线前置条件，默认开启不可绕过。

#### Scenario: 进入比赛页自动静默

- **WHEN** 用户进入 CF `/contest/{id}` 进行中比赛页
- **THEN** 桌宠切换到比赛模式状态
- **AND** 零提示、零气泡
- **AND** 规则引擎硬关闭
- **AND** LLM 通道禁用
- **AND** 审计日志记录"零介入"事实

#### Scenario: 赛后恢复

- **WHEN** 比赛结束或用户离开比赛页
- **THEN** Coach 自动恢复
- **AND** 可提示进入复盘/upsolve（仅赛后）

#### Scenario: 审计日志可导出

- **WHEN** 用户导出审计日志
- **THEN** 生成包含比赛时段与"零介入"事实的文件
- **AND** 可作为诚信证明

### Requirement: Socratic Ladder 分级提示

系统 SHALL 提供 6 级分级提示，概念/标签置于最高层（CP 中"想法即答案"），用户主动点"再给一点"才升级，升级有冷却，不直接给完整答案。

#### Scenario: 升级流程

- **WHEN** 用户首次触发提示
- **THEN** 显示 Level 1 轻提醒
- **WHEN** 用户点"再给一点"
- **THEN** 升级到 Level 2 元认知
- **AND** 不跳级
- **WHEN** 升级到 Level 5 概念/标签
- **THEN** 需二次确认"该提示接近题解方向"

### Requirement: 零 LLM 靶向提示（ConstraintParser）

系统 SHALL 从题面自动抽取数据范围与时限，与 verdict 联动生成靶向提示，解析失败静默退化到通用提示。

#### Scenario: TLE 靶向提示

- **WHEN** 用户提交 TLE
- **AND** ConstraintParser 已解析出 `n ≤ 2·10^5`、时限 `1.00s`
- **THEN** 提示包含具体数值对照
- **AND** 形如"n ≤ 2·10^5 通常需要 O(n log n) 以内，检查嵌套循环"

#### Scenario: 解析失败退化

- **WHEN** ConstraintParser 无法解析题面约束
- **THEN** 静默退化到通用复杂度提示
- **AND** 不阻塞主流程

### Requirement: 用户反馈持久化

系统 SHALL 持久化用户反馈（helpful / not_helpful / dismiss / never_today），并影响后续同类型提示频率。

#### Scenario: 反馈影响频率

- **WHEN** 用户对某类提示标记"没帮助"
- **THEN** 后续同类提示频率降低
- **WHEN** 用户标记"今天别提醒"
- **THEN** 当天同类提示屏蔽

### Requirement: 单题时间轴复盘

系统 SHALL 把一次做题过程还原成可视时间轴，数据全部来自现有表，不新增采集。

#### Scenario: 查看任一题目时间轴

- **WHEN** 用户打开任一已做题目
- **THEN** 可查看完整时间轴
- **AND** 包含进入题目 → 提交序列（verdict 变化）→ Coach 介入点 → AC/放弃
- **AND** 思考/实现时间切分（结合三态）

### Requirement: 干预效果指标页

系统 SHALL 提供指标页展示提示展示数、"再给一点"点击率、"有帮助"反馈率、干预后同题 AC 转化率、桌宠关闭率，支撑答辩数据收集。

#### Scenario: 指标页展示

- **WHEN** 用户打开指标页
- **THEN** 可看到上述全部指标
- **AND** 支持注入模拟数据核对计算

### Requirement: 比赛模式审计日志

系统 SHALL 在 `coach_interventions` 表中记录比赛时段与"零介入"事实，可导出。

#### Scenario: 比赛时段记录

- **WHEN** 比赛模式激活与结束
- **THEN** `coach_interventions` 表写入对应记录
- **AND** 包含时段、状态、零介入事实

## MODIFIED Requirements

### Requirement: SubmissionWatcher 通知出口

现有 `SubmissionWatcher` 只通过 `webContents.send('submissions:detected')` 发给 renderer，主进程无订阅点。修改为增加主进程侧 EventEmitter 出口，不改抓取与解析逻辑。

#### Scenario: 主进程订阅提交事件

- **WHEN** `SubmissionWatcher` 处理完一次提交
- **THEN** 通过 EventEmitter 通知主进程订阅者
- **AND** `CoachEventBridge` 收到事件
- **AND** 现有 renderer 通知不受影响

## Assumptions & Decisions

1. Demo 默认不接 LLM，所有提示由本地规则 + 模板 + ConstraintParser 生成。
2. 形象自定义（M5）不做，用内置 SVG/CSS 科技感模板演示。
3. 数据库迁移编号 022-024 已核对无冲突（当前最大 021）。
4. 桌宠窗口优先 Windows 验证，macOS/Linux 后续适配。
5. `coach_interventions` 表同时承载干预记录与比赛模式审计日志。
6. 时间轴复盘与指标页数据全部来自本地表，不新增采集。
7. 指标页支持注入模拟数据，便于答辩前预演。
8. 不修改核心事实表 schema，只读取。
9. Demo 完成后为复赛预留 LLM Provider、RAG、代码分析、形象自定义的扩展接口。

## Verification Strategy

1. **阶段 1 验收**：启动应用后桌宠出现，6 状态可手动切换，气泡可交互，设置可持久化。
2. **阶段 2 验收**：模拟提交后规则触发，比赛页进入后零提示，审计日志可导出。
3. **阶段 3 验收**：TLE 提示出现具体数值对照，Socratic Ladder 升级有冷却，反馈影响频率。
4. **阶段 4 验收**：任一题目可查看时间轴，指标页展示全部指标且支持模拟数据注入。
5. **跨阶段**：`npm run typecheck` + `npm run lint` + `npm run test:all` 通过。
