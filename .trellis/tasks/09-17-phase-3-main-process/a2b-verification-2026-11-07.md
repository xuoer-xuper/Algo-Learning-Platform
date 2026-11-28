# A2b 平台题号查找验收

## 范围

只转换 `problem/queries.ts` 中 `findProblemIdByPlatformKey` 的单条SELECT，删除手写row断言；
现有recent/detail/visit查询、mutations、schema、迁移、IPC与连接生命周期不改。
默认仍通过原兼容导出口同步返回string/null，不新增全局adapter或额外连接。

## 行为

- 平台和题号都用精确大小写敏感的绑定相等，不trim、不用LIKE、不解释引号/通配符。
- `deleted_at IS NULL`保留；deleted_at=0与其他非空删除时间一样排除。
- 缺行/NULL ID返回null，空字符串ID原样返回；不通过过滤NULL ID或收紧schema改存量语义。
- 查询读取同一未提交事务，关闭重开后使用当前连接；真实SQLite错误继续抛出，不伪装未找到。

## 验证

| 检查 | 结果 |
| --- | --- |
| 新lookup回归 | 14/14：原SQL oracle、两维键、大小写/空白、6种字面量、null/空ID、tombstone、只读/事件/事务/生命周期/异常 |
| 实现聚焦 | lookup/overview/client共3文件25用例通过 |
| 独立复核 | 含UI诊断组合6文件54用例；typecheck两次、full lint、架构22/22、docs通过，无遗留发现 |
| `pnpm test:db` | 25文件172用例；原生Electron repositories14/14，含新增查键边界 |
| 当前组合 `pnpm test:all` | 200文件1702用例；真实Electron及UI11/11通过 |
| `pnpm build:check` | 通过，native external守卫通过 |
| 覆盖率 / jscpd | 75.08 / 68.90 / 72.16 / 78.27；重复率1.76% |

均为临时/内存库，用户原库未操作；001–030、基线SQL/meta及A1安全协调器无改动。
日志在忽略目录 `algo-electron/tmp/drizzle-a2b-{db,all,build,duplication}.log`。
UI失败诊断是独立提交，不改变产品逻辑或测试动作/断言，不宣称修复历史瞬时失败。

## 后续

A2b提交`5b13d85`已正常推送，CI `42379159788`两项全绿；没有跳过hooks或放宽UI断言。

A2c已完成只读技术研究，计划保留真实bound-null UPDATE、原六列SET、时间与事务通知行为后
转换upsert的三条语句；见`research/a2c-problem-upsert.md`。运行时写入等价尚未执行，
不可把类型/SQL生成探针当作迁移完成。阶段3及PR #8仍未全部完成，不自动合并/发布。
