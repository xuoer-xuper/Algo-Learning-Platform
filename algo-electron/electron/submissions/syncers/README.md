# Submission Syncers

## 1. 职责

`electron/submissions/syncers/` 是提交同步器的预留目录，用于未来把 `SyncService` 中按平台同步的代码拆成独立模块。

当前目录暂无运行时代码，实际同步入口仍在 `electron/submissions/SyncService.ts`。

## 2. 计划边界

未来迁入本目录的 syncer 应只负责“从某个平台获取一批提交候选”，例如：

- Codeforces API 同步。
- VJudge 当前页同步。
- 当前页面通用表格同步。

题目关联、去重写入、首次 AC 和统计刷新仍由 `SubmissionBatchWriter` 负责。

## 3. 边界规则

- syncer 不直接写数据库。
- syncer 不注册 IPC。
- syncer 不改变 Cookie 策略。
- syncer 返回 `SubmissionData[]` 或明确的同步结果，由上层统一写入。

## 4. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests\submissions\syncService.test.ts
```
