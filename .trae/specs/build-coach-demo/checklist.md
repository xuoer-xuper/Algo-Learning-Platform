# Checklist

## 阶段 1：桌宠视觉壳

- [ ] 启动应用后桌面出现透明悬浮桌宠窗口，不在任务栏显示
- [ ] 桌宠渲染类 Codex 科技感小人，非萌系
- [ ] 6 种状态（idle/thinking/alert/celebrate/sleep/focus）可手动切换且视觉变化明显
- [ ] 气泡可显示标题、消息、来源标记（本地/LLM）
- [ ] 3 个默认按钮（给一点提示 / 先不用 / 今天别提醒）可点击并触发 IPC
- [ ] 点击穿透与交互互斥正确：hover 非交互区域穿透，hover 气泡/按钮可交互
- [ ] 拖拽移动可用
- [ ] 主窗口关闭时桌宠退出
- [ ] 设置面板可持久化（启用开关/位置/缩放/透明度/测试提示）
- [ ] preload 复用主窗口 `preload.mjs`，hash 路由 `#/coach-pet` 分流正确

## 阶段 2：事件触发 + 比赛模式

- [ ] `CoachEvent` / `ProblemSession` / `CoachIntervention` 类型定义完成，tsc 通过
- [ ] ProblemSession 三态计时：切到本地 IDE 不虚增 active_seconds
- [ ] 挂机（主窗口失焦 + 系统空闲）不计时
- [ ] 难度自适应阈值生效（rating ≥ 1600 放宽）
- [ ] SubmissionWatcher 新增主进程 EventEmitter 出口，不改抓取逻辑
- [ ] 现有 renderer `submissions:detected` 通知不受影响
- [ ] CoachEventBridge 订阅成功，同题 WA ≥ 2 触发 multiple_wrong
- [ ] 同题相同 verdict 重复触发 same_error
- [ ] 规则引擎节流：同类型事件 30 分钟内不重复触发
- [ ] 防 hint abuse：升级冷却（≥ 2 分钟或需一次新提交）
- [ ] 比赛模式 ContestGuard：进入 CF `/contest/{id}` 进行中比赛页后零提示、零气泡
- [ ] 规则引擎在比赛模式下硬关闭
- [ ] LLM 通道在比赛模式下禁用
- [ ] 桌宠切换到"比赛模式"状态
- [ ] 审计日志写入 `coach_interventions` 表，可导出
- [ ] 赛后自动恢复 + 提示复盘/upsolve
- [ ] ContestGuard 单元测试覆盖 URL/时间窗判定
- [ ] 数据库迁移 022/023/024 可重入，加入 connection.ts 迁移列表
- [ ] IPC channel 注册且 preload 暴露（coach:getState/triggerHint/dismissHint/feedback/getSession/getMetrics/exportAuditLog）
- [ ] 规则引擎单元测试覆盖核心规则

## 阶段 3：通用提示 + 靶向提示

- [ ] 提示模板库 ≥ 30 条，覆盖 9 类（复杂度/边界/数据范围/初始化/溢出/输入输出/特判/越界/循环）
- [ ] 不同 verdict 产生差异化提示（WA→边界/特判/IO，TLE→复杂度，RE→越界/初始化）
- [ ] idle_too_long 触发元认知类提示
- [ ] Socratic Ladder 6 级：L0/L1/L2/L3/L4/L5
- [ ] 概念/标签（L5）置于最高层
- [ ] L5 升级需二次确认
- [ ] 升级有冷却，不跳级
- [ ] 不直接给完整答案
- [ ] 用户反馈（helpful/not_helpful/dismiss/never_today）可持久化
- [ ] 反馈影响后续同类型提示频率
- [ ] 重启后历史反馈仍存在
- [ ] ConstraintParser 可解析 CF/洛谷题面 `1 ≤ n ≤ 2·10^5`、`1.00s` 等模式
- [ ] TLE 提示中出现具体数值对照（"n ≤ 2·10^5 通常需要 O(n log n) 以内"）
- [ ] WA 且值域 ≥ 1e9 触发溢出提示
- [ ] 解析失败静默退化到通用提示，不阻塞主流程
- [ ] 对 20 道样例题面抽取准确率 ≥ 80%
- [ ] HintSelector 单元测试通过

## 阶段 4：过程复盘 + 答辩数据

- [ ] 任一已做题目可查看完整时间轴
- [ ] 时间轴包含：进入题目 → 提交序列（verdict 变化）→ Coach 介入点 → AC/放弃
- [ ] 思考/实现时间切分（结合三态）
- [ ] 时间轴数据全部来自现有表，不新增采集
- [ ] 时间轴路由入口与导航可用
- [ ] 指标页可展示：提示展示数 / "再给一点"点击率 / "有帮助"反馈率 / 干预后同题 AC 转化率 / 桌宠关闭率
- [ ] 指标页支持注入模拟数据核对计算
- [ ] 指标页路由入口与导航可用

## 跨阶段验收

- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 通过
- [ ] `npm run test:all` 通过
- [ ] 手动启动应用端到端验证 4 阶段流程
- [ ] 不修改核心事实表 schema（只读取 submissions/problem_visits/activity_events/user_daily_stats）
- [ ] 不在 renderer 直接访问 SQLite
- [ ] Demo 默认不接 LLM，所有提示由本地规则 + 模板 + ConstraintParser 生成
- [ ] 为复赛预留 LLM Provider / RAG / 代码分析 / 形象自定义的扩展接口
