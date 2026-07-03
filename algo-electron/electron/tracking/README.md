# Tracking 模块说明

## 1. 职责

`electron/tracking/` 是刷题行为追踪层，负责在用户导航到题目页时记录访问开始、访问结束、活跃事件和当日统计重算。

本模块不解析站点细节；题目 URL 识别通过 `electron/parsers/registry.ts`。本模块不负责提交结果，提交记录由 `electron/submissions/` 管理。

## 2. 当前实现程度

当前包含：

- `TrackingService.ts`：题目访问开始/结束、activity event 和 daily stats 更新。
- `problemTitleTracking.ts`：把 `TabManager` 的导航、标题变化和活动 tab 事件接到题目标题补全流程。

`TrackingService.ts`：

- 导航到题目页时解析 `ProblemIdentity`。
- 检查站点是否启用。
- upsert `problems`。
- 写入 `problem_visits`。
- 写入 `activity_events` 的 `visit_start`。
- 结束上一次访问并记录停留时长。
- 访问开始和结束后重算当日 `daily_stats`。

`problemTitleTracking.ts`：

- 导航到题目页后调用 `TrackingService.handleNavigation()` 并通知 renderer。
- 根据浏览器标题或 DOM fallback 脚本补全题目标题。
- 对 Codeforces browser title 使用站点专用跳过策略，避免旧页面标题污染题目名。
- 对 PTA 和 VJudge contest 页面保留额外延迟抓取。

## 3. 核心函数

`TrackingService`：

- `setProblemDetectedCallback(callback)`：注册题目识别回调。
- `handleNavigation(url)`：处理导航，返回识别到的 `ProblemIdentity` 或 `null`。
- `endCurrentVisit()`：结束当前访问并写入停留时长。
- `installProblemTitleTracking(options)`：注册 `TabManager` 的导航、标题变化和活动 tab 回调，通过注入回调通知 renderer。

## 4. 数据流

```text
TabManager navigate / in-page navigate
  -> TrackingService.handleNavigation(url)
  -> parsers.parseUrl(url)
  -> siteRepository.getSiteById(platform)
  -> problemRepository.upsertProblem(identity)
  -> problem_visits insert
  -> activity_events insert
  -> statsRepository.recomputeDailyStats(today)
```

离开当前题目或关闭应用时应调用 `endCurrentVisit()`，确保 `duration_seconds` 被写入。

标题补全数据流：

```text
TabManager title / active tab / navigate
  -> installProblemTitleTracking()
  -> resolveBrowserTitleProblemIdentity() or DOM fallback script
  -> problemRepository.upsertProblem(identity)
  -> renderer problems:updated
```

## 5. 写入规则

- 只追踪启用站点。
- 当前只写入访问开始事件；提交事件由 submissions 写入路径负责。
- `currentVisit` 是进程内状态，不跨重启恢复。
- 统计重算失败不阻断浏览器导航。
- 标题补全只更新 `problems`，不创建提交记录，不读取 Cookie 或页面源码。

## 6. 测试入口

当前没有 tracking 独立测试。修改后至少运行：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

涉及行为变化时需要手测题目访问、离开页面、统计趋势和连续天数刷新。
