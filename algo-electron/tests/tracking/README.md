# Tracking Tests

## 1. 职责

本目录覆盖题目访问追踪的纯逻辑与启动恢复边界，不启动真实 OJ 页面，也不读取用户数据。

## 2. 当前覆盖

- `orphanProblemVisits.test.ts`：验证启动时把 `left_at IS NULL` 的遗留访问按 `entered_at` 封闭，时长归零并标记 `startup_recovery`。

## 3. 维护边界

- 测试使用可注入的数据库替身，不写入真实 `userData`。
- 正常访问开始/结束的数据库集成行为由 `tests/db/` 与 submissions/tracking 相关回归共同覆盖。
- 新增 tracking 子模块时同步本 README，并确保异常退出恢复不会虚增停留时长。

## 4. 验证入口

```powershell
cd algo-electron
npm run test:db
npm run test:all
```
