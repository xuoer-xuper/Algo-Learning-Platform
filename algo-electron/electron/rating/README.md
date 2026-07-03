# Rating 模块说明

## 1. 职责

`electron/rating/` 负责平台 rating 数据抓取和格式化。当前只实现 Codeforces rating。

本模块不直接写数据库。账号、rating history 持久化由 `electron/db/repositories/accountRepository.ts` 和主进程 IPC 流程负责。

## 2. 当前实现程度

当前只有 `codeforces.ts`：

- 调用 Codeforces `user.info` 获取当前 rating 和历史最高 rating。
- 调用 Codeforces `user.rating` 获取 rating 变化历史。
- 将 Codeforces 原始 rating history 格式化为项目内部字段。

## 3. 函数说明

- `fetchCFCurrentRating(handle)`
  - 请求 `https://codeforces.com/api/user.info`。
  - 返回 `{ handle, rating, maxRating }`，查不到时返回 `null`。
- `fetchCFRatingHistory(handle)`
  - 请求 `https://codeforces.com/api/user.rating`。
  - 返回 Codeforces 原始 rating change 列表。
- `formatCFRatingHistory(history)`
  - 输出 `contestId`、`contestName`、`rank`、`ratingBefore`、`ratingAfter`、`delta`、`contestAt`、`rawJson`。

## 4. 边界规则

- 网络错误应向调用方抛出，由上层 IPC 或 service 转换为用户可见错误。
- 新增平台 rating 时应新增独立文件，不要把多平台逻辑塞进 `codeforces.ts`。
- 时间格式继续使用 `shared/time.ts`。
- 不在日志里输出用户隐私 token 或 Cookie。

## 5. 测试入口

当前没有 rating 单元测试。修改格式化逻辑时至少运行：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

修改网络调用时需要手测 Codeforces handle 同步。
