# Shared 模块说明

## 1. 职责

`electron/shared/` 存放主进程内跨模块共享的基础类型和时间工具。它不依赖 Electron UI、数据库连接、网络请求或站点 adapter。

## 2. 当前实现程度

当前包含：

- `types.ts`：统一题目标识、统一提交结果类型。
- `time.ts`：本地时间格式化工具。

## 3. 类型说明

`ProblemIdentity`：

- `platform`
- `platformProblemId`
- `canonicalUrl`
- `title`
- `contestId`
- `problemIndex`
- `sourcePlatform`
- `sourceProblemId`
- `confidence`

`Verdict`：

- `AC`
- `WA`
- `TLE`
- `MLE`
- `RE`
- `CE`
- `PE`
- `OLE`
- `SKIPPED`
- `TESTING`
- `UNKNOWN`

`SubmissionData`：

- `platform`
- `platformSubmissionId`
- `problemId`
- `verdict`
- `rawVerdict`
- `language`
- `submittedAt`
- `runtimeMs`
- `memoryKb`
- `sourceUrl`
- `rawJson`

## 4. 时间工具

- `nowBeijing()`：返回系统本地时间字符串，格式 `YYYY-MM-DDTHH:mm:ss.SSS`。
- `todayBeijing()`：返回系统本地日期 `YYYY-MM-DD`。
- `toBeijing(date)`：把 `Date` 转为系统本地时间字符串。

注意：函数名沿用 Beijing，但当前实现是系统本地时间；在东八区系统上等价于北京时间。

## 5. 边界规则

- 新增跨模块类型前先确认是否属于主进程共享契约。
- 不要把 DB row 形状、UI-only 状态或站点私有 payload 放进 shared。
- 修改 `Verdict` 必须同步 verdict 归一化、提交写入、统计和 UI 展示。

## 6. 测试入口

当前没有 shared 独立测试。修改后至少运行：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```
