# Tasks

## 阶段 1：桌宠视觉壳（M1）

- [ ] Task 1: 创建 Coach 桌宠透明窗口
  - [ ] SubTask 1.1: 新增 `electron/coach/CoachPetWindow.ts`，配置 transparent/frame:false/alwaysOnTop/skipTaskbar/hasShadow:false/resizable:false
  - [ ] SubTask 1.2: preload 复用主窗口 `preload.mjs`，窗口加载与主窗口同源（dev `loadURL(devServerUrl + '#/coach-pet')`，prod `loadFile(index.html, { hash: 'coach-pet' })`）
  - [ ] SubTask 1.3: 实现点击穿透切换：默认穿透，hover 可交互区域经 IPC 临时关闭，离开恢复（`setIgnoreMouseEvents(true, { forward: true })`）
  - [ ] SubTask 1.4: 实现拖拽移动（鼠标事件 + setPosition）
  - [ ] SubTask 1.5: 与主窗口生命周期绑定（主窗口关闭时桌宠退出）
  - [ ] SubTask 1.6: 在 `electron/main.ts` 中初始化入口
  - [ ] SubTask 1.7: 新增 `electron/coach/README.md`
- [ ] Task 2: 实现科技感小人渲染层
  - [ ] SubTask 2.1: 新增 `src/features/coach/CoachPet.tsx` + `petStates.ts` + `styles/pet.css`
  - [ ] SubTask 2.2: SVG + CSS 实现几何体 + 粒子环 + 发光描边
  - [ ] SubTask 2.3: 定义 6 状态枚举 idle/thinking/alert/celebrate/sleep/focus
  - [ ] SubTask 2.4: 每状态对应动画与配色（冷感青蓝/紫，非萌系）
  - [ ] SubTask 2.5: 新增 `#/coach-pet` 路由分流
- [ ] Task 3: 实现气泡与交互按钮
  - [ ] SubTask 3.1: 新增 `src/features/coach/CoachBubble.tsx` + `CoachActions.tsx`
  - [ ] SubTask 3.2: 气泡显示标题、消息、来源标记（本地/LLM）
  - [ ] SubTask 3.3: 3 个默认按钮（给一点提示 / 先不用 / 今天别提醒）
  - [ ] SubTask 3.4: 点击后向主进程发 IPC
  - [ ] SubTask 3.5: 气泡自动消失/手动关闭
- [ ] Task 4: 桌宠设置入口
  - [ ] SubTask 4.1: 新增 `src/features/settings/CoachPanel.tsx`，接入 `SettingsPage.tsx`
  - [ ] SubTask 4.2: 开关：启用 Coach、声音、气泡频率
  - [ ] SubTask 4.3: 位置重置、缩放、透明度
  - [ ] SubTask 4.4: "测试提示"按钮
  - [ ] SubTask 4.5: 持久化沿用 `electron/app/config.ts`

## 阶段 2：事件触发 + 比赛模式（M2）

- [ ] Task 5: 定义 CoachEvent 数据模型
  - [ ] SubTask 5.1: 新增 `electron/coach/types.ts`
  - [ ] SubTask 5.2: 定义 `CoachEvent`（event_id/session_id/event_type/severity/evidence/created_at）
  - [ ] SubTask 5.3: 定义 `ProblemSession`（含 detected_stuck_level）
  - [ ] SubTask 5.4: 定义 `CoachIntervention`（含 trigger_reason/intervention_level/source_type/message/related_tags/user_action）
  - [ ] SubTask 5.5: tsc 通过
- [ ] Task 6: 实现 ProblemSession 三态计时追踪
  - [ ] SubTask 6.1: 新增 `electron/coach/ProblemSessionTracker.ts`
  - [ ] SubTask 6.2: 监听 TabManager active tab 变化与 `problem:detected`
  - [ ] SubTask 6.3: 进入题目页开 session，切到本地 IDE 挂起保持，回站或提交归入同一 session
  - [ ] SubTask 6.4: `active_seconds` 只累计有效活跃：主窗口 focus/blur + `powerMonitor.getSystemIdleTime()`
  - [ ] SubTask 6.5: 区分三态（读题/写码/卡壳），推导 `detected_stuck_level`
  - [ ] SubTask 6.6: 停留时间按 30-60s 聚合
  - [ ] SubTask 6.7: 暴露 `getCurrentSession()` / `getSessionHistory()`
- [ ] Task 7: 为 SubmissionWatcher 增加主进程出口
  - [ ] SubTask 7.1: 修改 `electron/submissions/SubmissionWatcher.ts`，增加 EventEmitter 出口
  - [ ] SubTask 7.2: 不改抓取与解析逻辑，只加通知出口
  - [ ] SubTask 7.3: 现有 renderer 通知不受影响
- [ ] Task 8: 实现 CoachEventBridge
  - [ ] SubTask 8.1: 新增 `electron/coach/CoachEventBridge.ts`
  - [ ] SubTask 8.2: 订阅 SubmissionWatcher EventEmitter
  - [ ] SubTask 8.3: 每次提交结果转为 CoachEvent
  - [ ] SubTask 8.4: 同题 WA ≥ 2 → `multiple_wrong`
  - [ ] SubTask 8.5: 同题相同 verdict 重复 → `same_error`
- [ ] Task 9: 实现本地规则引擎
  - [ ] SubTask 9.1: 新增 `electron/coach/rules/RuleEngine.ts` + `rules.ts`
  - [ ] SubTask 9.2: 规则表：条件 + 评分 + 干预等级
  - [ ] SubTask 9.3: 难度自适应阈值（rating ≥ 1600 放宽到 20-30 分钟）
  - [ ] SubTask 9.4: 节流：同类型事件 30 分钟内不重复
  - [ ] SubTask 9.5: 防 hint abuse：升级冷却（每级 ≥ 2 分钟或需一次新提交）
  - [ ] SubTask 9.6: 比赛模式下硬关闭（与 Task 12 联动）
  - [ ] SubTask 9.7: 用户"今天别提醒"临时屏蔽
  - [ ] SubTask 9.8: 单元测试覆盖核心规则
- [ ] Task 10: IPC 注册与 preload 暴露
  - [ ] SubTask 10.1: 新增 `electron/ipc/registerCoachIpc.ts`
  - [ ] SubTask 10.2: channel：`coach:getState` / `coach:triggerHint` / `coach:dismissHint` / `coach:feedback` / `coach:getSession` / `coach:getMetrics` / `coach:exportAuditLog`
  - [ ] SubTask 10.3: 接入 `electron/ipc/registerMainIpc.ts`
  - [ ] SubTask 10.4: 在 `electron/preload.ts` 暴露 Coach API
  - [ ] SubTask 10.5: 遵循现有 getter 注入模式
- [ ] Task 11: 数据库迁移与 repository
  - [ ] SubTask 11.1: 新增 `022_coach_events.ts`（coach_events 表）
  - [ ] SubTask 11.2: 新增 `023_coach_interventions.ts`（coach_interventions 表，含比赛模式审计字段）
  - [ ] SubTask 11.3: 新增 `024_coach_feedback.ts`（coach_feedback 表）
  - [ ] SubTask 11.4: 加入 `electron/db/connection.ts` 迁移列表
  - [ ] SubTask 11.5: 新增 `electron/db/repositories/coach/` 目录与 repository（events/interventions/feedback）
  - [ ] SubTask 11.6: 验证迁移可重入
- [ ] Task 12: 比赛模式与合规硬保障（ContestGuard）
  - [ ] SubTask 12.1: 新增 `electron/coach/ContestGuard.ts`
  - [ ] SubTask 12.2: URL 规则判断当前 tab 是否处于进行中比赛（CF `/contest/{id}`、洛谷比赛页）
  - [ ] SubTask 12.3: 比赛时间窗校验
  - [ ] SubTask 12.4: 检测到比赛进行中：规则引擎硬关闭、LLM 通道禁用、桌宠切换"比赛模式"状态
  - [ ] SubTask 12.5: 默认开启不可绕过
  - [ ] SubTask 12.6: 审计日志写入 `coach_interventions`，可导出
  - [ ] SubTask 12.7: 赛后自动恢复 + 提示复盘/upsolve
  - [ ] SubTask 12.8: 单元测试覆盖 URL/时间窗判定

## 阶段 3：通用提示 + 靶向提示（M3）

- [ ] Task 13: 建立通用提示模板库
  - [ ] SubTask 13.1: 新增 `electron/coach/hints/hintTemplates.ts`
  - [ ] SubTask 13.2: ≥30 条模板，9 类（复杂度/边界/数据范围/初始化/溢出/输入输出/特判/越界/循环）
  - [ ] SubTask 13.3: 每条带 id/category/tags?/text
  - [ ] SubTask 13.4: MVP 为 TS 内置文件，不入库（M7 再迁移）
- [ ] Task 14: 提示选择策略
  - [ ] SubTask 14.1: 新增 `electron/coach/hints/HintSelector.ts`
  - [ ] SubTask 14.2: verdict → 类别映射（WA→边界/特判/IO，TLE→复杂度，RE→越界/初始化）
  - [ ] SubTask 14.3: idle_too_long → 元认知类
  - [ ] SubTask 14.4: 不依赖算法标签
  - [ ] SubTask 14.5: 单元测试
- [ ] Task 15: Socratic Ladder 分级提示
  - [ ] SubTask 15.1: 新增 `electron/coach/hints/HintLadder.ts`
  - [ ] SubTask 15.2: 6 级：L0 不提示 / L1 轻提醒 / L2 元认知 / L3 关键细节边界 / L4 策略 / L5 概念标签
  - [ ] SubTask 15.3: 概念/标签置于最高层（CP 想法即答案）
  - [ ] SubTask 15.4: L5 升级需二次确认
  - [ ] SubTask 15.5: 每级升级有冷却（与 Task 9 防滥用联动）
  - [ ] SubTask 15.6: 手动演练
- [ ] Task 16: 用户反馈与节流
  - [ ] SubTask 16.1: 新增 `electron/coach/CoachFeedbackStore.ts`
  - [ ] SubTask 16.2: 反馈类型 helpful/not_helpful/dismiss/never_today
  - [ ] SubTask 16.3: 写入 `coach_feedback` 表
  - [ ] SubTask 16.4: 反馈影响后续同类型提示频率
  - [ ] SubTask 16.5: 重启后历史反馈仍存在
- [ ] Task 17: 本地题面约束解析（ConstraintParser）
  - [ ] SubTask 17.1: 新增 `electron/coach/problemFacts/ConstraintParser.ts`
  - [ ] SubTask 17.2: 内嵌浏览器注入脚本抽取题面约束文本
  - [ ] SubTask 17.3: 正则解析 `1 ≤ n ≤ 2·10^5`、`时间限制 1.00s` 等模式（CF/洛谷先行，复用现有 parsers 站点扩展点）
  - [ ] SubTask 17.4: 与 verdict 联动：TLE → 数值对照提示，WA 且值域 ≥ 1e9 → 溢出提示
  - [ ] SubTask 17.5: 解析失败静默退化到通用提示
  - [ ] SubTask 17.6: 解析结果缓存（评估是否需 `026_problem_constraints.ts`）
  - [ ] SubTask 17.7: 对 20 道样例题面统计抽取准确率（目标 ≥ 80%）

## 阶段 4：过程复盘 + 答辩数据（M9 精选）

- [ ] Task 18: 单题时间轴复盘视图
  - [ ] SubTask 18.1: 新增 `src/features/coach/SessionTimelineView.tsx`
  - [ ] SubTask 18.2: 时间轴：进入题目 → 提交序列（verdict 变化）→ Coach 介入点 → AC/放弃
  - [ ] SubTask 18.3: 思考/实现时间切分（首次提交前 vs 提交间隔，结合三态）
  - [ ] SubTask 18.4: 数据全部来自 `problem_visits` / `submissions` / coach 表，不新增采集
  - [ ] SubTask 18.5: 新增路由入口与导航
  - [ ] SubTask 18.6: 手动对照一次真实做题过程验证
- [ ] Task 19: 干预效果指标页
  - [ ] SubTask 19.1: 新增 `src/features/coach/CoachMetricsView.tsx`
  - [ ] SubTask 19.2: 指标：提示展示数 / "再给一点"点击率 / "有帮助"反馈率 / 干预后同题 AC 转化率 / 桌宠关闭率
  - [ ] SubTask 19.3: 基于 `coach_feedback` + `coach_interventions` 聚合
  - [ ] SubTask 19.4: 支持注入模拟数据核对计算（答辩预演）
  - [ ] SubTask 19.5: 新增路由入口与导航

## 跨阶段基础设施与验收

- [ ] Task 20: 集成与验收
  - [ ] SubTask 20.1: `npm run typecheck` 通过
  - [ ] SubTask 20.2: `npm run lint` 通过
  - [ ] SubTask 20.3: `npm run test:all` 通过（含新增规则/解析单元测试）
  - [ ] SubTask 20.4: 手动启动应用验证 4 阶段端到端流程
  - [ ] SubTask 20.5: 验证比赛模式硬保障：进入比赛页零提示、审计日志可导出
  - [ ] SubTask 20.6: 验证 TLE 靶向提示出现具体数值对照
  - [ ] SubTask 20.7: 验证 Socratic Ladder 升级有冷却与二次确认
  - [ ] SubTask 20.8: 验证时间轴与指标页可正常展示

# Task Dependencies

- Task 5（数据模型）是阶段 2 的前置，Task 6/8/9/12 依赖 Task 5
- Task 7（SubmissionWatcher 出口）是 Task 8 的前置
- Task 9（规则引擎）依赖 Task 5/6/8
- Task 12（ContestGuard）依赖 Task 9（规则引擎硬关闭）与 Task 11（审计日志表）
- Task 11（数据库）是 Task 12/16 的前置
- Task 13/14/15（提示库）相互独立，可并行，但 Task 15 依赖 Task 9 的防滥用冷却
- Task 17（ConstraintParser）依赖阶段 2 的 CoachEventBridge
- Task 18/19 依赖阶段 2/3 的数据落库
- Task 20 是最后验收，依赖所有任务完成

# 可并行任务

- 阶段 1（Task 1-4）与阶段 2 的 Task 5（数据模型）可并行
- Task 13（模板库）与 Task 14（选择策略）可并行
- Task 18（时间轴）与 Task 19（指标页）可并行
