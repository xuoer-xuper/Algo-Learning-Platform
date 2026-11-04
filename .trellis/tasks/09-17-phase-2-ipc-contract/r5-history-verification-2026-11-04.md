# R5 历史代码重建基础验证

## 用户要求与范围

2026-11-04 用户明确要求：现在已是 2.0.0，不应再强求提供不存在的 1.0.0 用户库；
应查看历史 Git 代码确认旧版如何建库和写入。该要求已替换原三份真实旧库硬前置。

本块在独立分支 `feat/db-unix-ms-timestamps` 实施，基于尚未合并的 R1-R4 分支。
只修改测试、生成器、规范与任务记录；**没有实现 030，没有改生产时间类型，没有访问或
迁移真实用户库**。实际历史结构、合成测试数据、真实样本三类证据严格区分。

## 历史结论

| 来源 | 固定提交 | schema 上限 |
| --- | --- | --- |
| v1.0.0 / package 1.0.0 | `0758b253766db648f47418e95116437762001261` | 21 |
| v1.1.0-beta.2 / package 2.0.0-beta.2 | `b27debfcac5a368da1a19113bd1a48dc87526b79` | 24 |
| v2.0.0-rc.1 | `7d052efcf37903ff22ad0a72d3147e62b600e0b9` | 29 |
| v2.0.0 | `d2d2b0c6b758e1936b00aa602ea172dbb848b065` | 29 |

- v1 的普通 `nowBeijing/toBeijing` 实际使用系统本地 date getters；名称不是固定 UTC+8 的证据。
- v1/beta 的 user_scripts 使用 `toISOString()` 带 Z，`e35212b` 才改固定 UTC+8 无后缀。
  旧新脚本值可以按后缀和表字段来源解释，先前“同一脚本无后缀语义混用”的担忧不成立。
- credential/runtime 建表发生在固定 UTC+8 helper 引入之后。明确 offset/Z 优先，普通无后缀
  按 local 契约，已知六组脚本/凭据表的无后缀值按 UTC+8。
- VJudge 透传日期缺少源时区的情况仍是明确的兼容假设，不从字符串猜时区；非法值应安全失败。
- 历史 migration 仍依赖旧 formatter，不能为删除函数而破坏 001–029；PRD/设计已同步兼容例外。

详细引用见 `research/r5-git-history.md`；重建架构见 `research/r5-reconstruction-plan.md`。

## 实际完成的验证

- 再生器从固定 Git blob 解析并执行历史 migration/helper 闭包，不加载旧应用或 connection。
  来源闭包分别 27/30/36 个文件，其 Git blob 和 SHA256 均独立核对正确。
- 生成 `v1.schema.sql`、`beta2.schema.sql`、`rc1.schema.sql` 和 `provenance.json`；
  表数量分别 17/20/25，全部为文本，不提交 SQLite 文件。
- 每次生成在第二个内存库重放 SQL，DDL/完整台账/外键/integrity 一致；连续再生字节完全相同。
- 历史 helper 实际在 UTC、Asia/Shanghai、America/New_York 三个进程运行，local 随时区变化，
  fixed UTC+8 保持一致。未执行应用或用户数据代码。
- 五条升级测试覆盖 21/24/29→29、原时间字符串与统计保留、关系/约束/索引/BLOB、备份、
  重复初始化；先提交一次迁移再让后一迁移失败，验证恢复旧 schema/数据和 failure marker。
- `PATH=''`、Git 不可执行条件下，正常历史升级测试仍 5/5 通过，证明 CI 不依赖历史 tag。
- 真实 Electron ABI 的 migrationSafety 增加 21→29 用例，4/4 通过。
- `pnpm test:all` 最终退出 0：185 文件 / 1498 用例，真实 Electron/DB 套件及 Playwright 10/10。
- 应用/测试 typecheck、lint、docs、安全守卫、`git diff --check` 通过。

本地日志在忽略目录 `algo-electron/tmp/`：`r5-history-time-probe.log`、
`r5-fixture-regeneration-verify.log`、`r5-fixture-db.log`、`r5-groundwork-all.log`。

## 下一步

历史输入缺失问题已通过可复现重建解决，不再向用户要求真实 1.0.0 库。
继续 R5 的严格时间转换、82 列外键安全重建、统计/导入导出兼容以及全栈类型迁移；
本块的到29测试随后扩展到30，并对现有真实24/29样本的隔离副本补充验证。
未将本块标成整个 R5 完成，也未归档阶段2。
