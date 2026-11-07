# A2a 题目总览 Drizzle 查询验收

## 范围

A1 `1ba968b` 已推送且CI `42373778745`全绿后，转换
`electron/db/repositories/problem/overview.ts` 的四条查询。五个同步函数及原兼容导出口不变。
未改schema/client/connection/迁移/IPC/其他域查询，未搬目录或引入ORM单例。

## 保持的行为

- 总题数和平台分布使用count(*)行语义，nullable TEXT主键仍计入，deleted_at=0仍代表删除。
- 今日访问保持distinct problem_id及本地日[start,end)，仍包含软删除访问和已删除题目的访问。
- 最近活跃仍包含tombstone事件，timestamp_ms内部Date显式转number，epoch0/null不混淆。
- 平台分布仅按数量降序，不新增同分次序；每次包装当前原生连接，关闭重开不复用失效连接。
- 只读操作不写库、不创建迁移台账、不发R4通知，能读到同连接未提交事务。

## 验证

| 检查 | 结果 |
| --- | --- |
| 新增总览测试 | 8/8，冻结时钟并与原SQL逐项对照 |
| 默认总览/client聚焦 | 11/11 |
| America/New_York | 8/8；测试日实测23小时，未硬编码24小时 |
| 独立复核 | 4文件/25用例；typecheck两次、lint、architecture22/22、docs通过，无遗留发现 |
| `pnpm test:db` | 24文件/158用例；真实Electron repositories13/13含numeric/epoch0新增场景 |
| `pnpm test:all` | 198文件/1673用例；真实Electron及UI11/11通过 |
| `pnpm build:check` | 通过；生产构建及native external守卫通过 |
| 覆盖率 | statements75.08%、branches68.90%、functions72.16%、lines78.27% |
| jscpd | 1.76% |

原SQL oracle使用独立本地午夜边界；query_only、serialize、total_changes、pragma和事件订阅
共同验证无写入。原生Electron测试确认nullable ID行仍计数、0/毫秒返回不含Date。
冻结001–030、基线SQL/meta和A1安全协调器无变更。全部使用临时/内存库。

日志在忽略目录 `algo-electron/tmp/drizzle-a2a-{db,all,build,duplication}.log`。
本块不是整个problem域完成：identity/visit/recent/detail、mutations和omnibox仍待分批转换，
nullableID DTO政策必须单独明确，不能通过收紧schema或过滤存量行暗改行为。
