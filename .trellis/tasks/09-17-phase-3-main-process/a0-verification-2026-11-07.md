# A0 Drizzle 基础验收

## 交付范围

阶段2已合并归档：dev `b74773b`，归档提交 `3702f01` 已推送、CI `42331215654` 通过。
阶段3在 `refactor/drizzle` 激活，本块只建立schema/client/dependencies/config与等价测试。
没有替换生产repository、启用Drizzle migrator、写Drizzle台账、搬主进程目录或访问用户库。

## 实施

- 固定 `drizzle-orm@0.45.4`、`drizzle-kit@0.31.11`；`drizzle.config.ts` 纳入配置类型检查。
- `src/main/db/schema.ts` 映射030之后25表，82个时间列使用timestamp_ms；保留现有
  列名/空值/默认值/主键/唯一/部分索引/CHECK/FK/BLOB。
- `createDrizzleClient(sqlite)` 只包装已有原生连接，明确返回类型，不开第二库、不管理关闭。
- 候选 `drizzle/0000_baseline.sql`、snapshot/journal通过 `db:generate` 生成；重复生成
  无新迁移，SQL与元数据字节一致。尚未登记或应用到生产数据库。
- 新README和项目规范明确A0/A1边界；生成meta由Kit管理，Prettier只排除该生成目录，
  手写schema/client/测试/README仍检查。

## 复核重点

- SQLite旧TEXT主键未声明NOTNULL，使用table-level primaryKey避免默默收紧。
- Kit把table UNIQUE编译为命名unique index；仅规范化该表达差异，仍比较完整索引多重集、
  顺序/方向/排序规则/唯一/部分predicate，现有显式索引名必须保留。
- 增加重命名索引的反例与CHECK字符串字面量保真测试，避免元数据比较器漏检。
- ORM读Date、物理库/外部DTO仍整数毫秒；epoch0/null/毫秒精度、BLOB和同步回滚测试通过。
- 真实Electron ABI套件用同一原生连接验证ORM，无Drizzle台账/额外连接/启动副作用。

## 验证

| 检查 | 结果 |
| --- | --- |
| A0聚焦测试 | 11/11（schema8/client3） |
| `pnpm test:db` | 通过；真实Electron repositories12/12含新增ORM场景 |
| `pnpm test:all` | 194文件/1574用例，UI11/11，所有真实Electron套件通过 |
| `pnpm build:check` | 通过 |
| Typecheck应用/测试、lint、architecture、安全、docs | 通过 |
| 重复生成 | 无变化，SQL/meta字节一致 |
| jscpd | 1.78%，低于3% |

SQL SHA256：`b92f46f0e3cf2258b73dd4c1845c4646640b2f7d98309ef96d681bbf2bc20216`。
日志在忽略目录 `algo-electron/tmp/drizzle-a0-*`，没有私密数据库进入Git。

## 后续

A1需实现并验证连续legacy台账/物理schema/Drizzle hash-prefix/资源校验、Drizzle-only pending
的备份与恢复，再激活生产迁移器。其后逐域查询迁移；目录搬迁仍独立。本块不代表阶段3完成。
