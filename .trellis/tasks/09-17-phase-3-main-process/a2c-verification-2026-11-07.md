# A2c 题目 Upsert Drizzle 验收

## 范围与兼容

在A2b `5b13d85`及CI `42379159788`全绿后，只转换`upsertProblem`的lookup/update/insert
三条语句并删除手写row断言。`deleteProblem`函数体经独立文本比较保持完全不变。
未改schema、迁移、客户端/连接生命周期、IPC、标题策略或其他域查询。

- 使用原连接，不缓存adapter、不新增事务，仍同步返回void。
- bound-null `eq(problems.id, sql.param(existing.id))`保留真实UPDATE/no-op与原通知；
  不改IS NULL、不修ID、不提前返回，不跳过readonly/schema错误。
- 六列SET和CASE/COALESCE保持，避免改变UPDATE OF触发语义；缺省/null保留旧值，空串可覆盖。
- 标题质量与CJK替换策略、insert-only source、visited状态、非复活tombstone保持；UUID仅新增时生成。
- 捕获一次毫秒时间并用Date写timestamp_ms，epoch0和毫秒精度不变；外部仍数字。
- 原语句成功后通知保留；外层callback/COMMIT/savepoint失败丢弃对应topics，partial autocommit仍保留已提交部分。

## 验证

| 检查 | 结果 |
| --- | --- |
| 新upsert回归 | 35/35，冻结原三语句oracle在分别初始化的真实内存库比较完整原始行/事件 |
| 实现扩展聚焦 | 10文件85用例通过 |
| 独立复核 | 11文件88用例，typecheck两次、full lint、架构22/22、docs通过；无遗留发现 |
| `pnpm test:db` | 26文件207用例；真实Electron repositories15/15含bound-null通知及整数时间 |
| `pnpm test:all` | 201文件1737用例；真实Electron和UI11/11通过 |
| `pnpm build:win` | NSIS构建、native external与fuses、真实打包双实例及资源/台账检查通过 |
| 覆盖率 | statements75.12%、branches68.98%、functions72.16%、lines78.30% |
| jscpd | 1.76% |

关键反例：两个NULL ID行完全不变但仍按旧规则通知；query_only及缺SET列时NULL ID路径
仍失败且无通知；六个UPDATE OF触发器全部按旧规则运行；延迟FK直到COMMIT失败，测试确认
callback已成功但事实与通知仍回滚。所有fixture仅为合成临时数据，未碰用户原库。

日志在忽略目录`algo-electron/tmp/drizzle-a2c-{db,all,build-win,duplication}.log`。
冻结001–030与基线SQL/meta未修改；特定legacy no-op通知已写入规范，不放宽其他no-op规则。

## 后续

下一候选A2d是deleteProblem：保留日期UNION原始数值、四表删除顺序、实际提交后通知和
post-commit统计失败语义。当前删除/DTO读查询/omnibox及其他域迁移仍未完成，阶段3不归档，
PR #8仍draft，不自动合并、发布或打tag。
