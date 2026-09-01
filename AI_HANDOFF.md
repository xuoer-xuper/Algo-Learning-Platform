# AI 交接记录

> 本文件记录 AI 助手之间的工作交接状态，便于后续 AI 快速了解当前进展与待办事项。

## 最近完成（2026-09-01）

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

## 当前状态

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

## 待办事项

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
