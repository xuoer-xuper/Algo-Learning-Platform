# A1 安全迁移接管验收

## 交付范围

在 A0 `e1e3ae0` 之后接通默认异步安全初始化：可信资源校验、legacy 001–030、
物理结构核对、Drizzle 基线登记及后续 migrator。连接、备份、恢复和关闭仍由原生命周期拥有。
本块不转换业务查询、不迁目录、不发布、不合并 PR #8，也不代表阶段3完成。

## 安全契约

- SQL/journal 的 tag、顺序、时间、hash 和完整文件集合在开库之前校验；生产仅从
  appRoot/drizzle 或 resources/drizzle 读取，不用 cwd 或环境变量回退。
- legacy 版本和名称必须是连续已知前缀；完整 Drizzle hash/timestamp 前缀也必须匹配。
  `SERIAL PRIMARY KEY` 不是 SQLite INTEGER rowid，合法空 id 保留。
- 第一次基线登记及仅有基线的重启，对照可信 SQL 在内存库解析的物理结构。
  不重复执行基线 CREATE，不擅自修复用户额外表、列、view 或 trigger。
- 一次 SQLite backup 覆盖 legacy、基线和后续迁移，Drizzle-only pending 同样备份。
  后一步失败恢复整个尝试；稳定 `legacy:<version>` / `drizzle:<tag>` 与旧 marker 兼容。
- 同步测试入口及显式 migrations（含空数组）保持 legacy-only；无额外 R4 数据变化通知。
- 冻结的 001–030、基线 SQL 和生成 meta 无变化；未读写任何用户原库。

## 独立复核

所有发现已修正并加入回归，无未关闭 A1 问题：

- `table_info` 漏掉生成列，改完整 `table_xinfo`、layout、index、FK、CHECK 与 trigger 校验。
- 注释 CHECK 不能伪装真实约束；词法扫描保留字面量并忽略注释/quoted identifiers。
- 普通 PRAGMA 不暴露的 COLLATE、ON CONFLICT、DEFERRABLE、AUTOINCREMENT 漂移拒绝。
- `LIKE 'sqlite_%'` 的 `_` 是通配符，改用 literal reserved-prefix GLOB。
- UNIQUE 只允许已知 Kit 名称与 SQLite inline autoindex 表达差异，不能任意重命名。
- 未知大写 `.SQL` 和 SQL 命名目录也属于资源集合错误。
- 新 `src/main` 路径 SQL 与 shared/renderer/preload DB 依赖有真实 runner 变异测试。
- 关闭断言明确验证目标连接，而非只观察到内存预期库关闭；原迁移错误和恢复错误分别保存。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 专用 A1 测试 | 80/80：资源23、安全10、结构/历史47 |
| 实现端聚焦门 | 11文件/186用例通过 |
| 独立检查聚焦门 | 10文件/175用例通过；两次typecheck、lint、docs通过 |
| `pnpm test:all` | 197文件/1665用例；真实Electron套件与UI11/11全部通过 |
| 覆盖率 | statements75%、branches68.89%、functions72.03%、lines78.18% |
| 架构 / 打包配置 | 22/22、9/9通过 |
| jscpd | 1.76%，低于阶段目标2%及CI门3% |
| `pnpm build:win` | NSIS构建、native external守卫、生产fuse检查、真实打包双实例冒烟通过 |
| 历史升级 | 重建21/24/29→30→Drizzle；合成事实、备份、幂等及失败恢复通过 |

真实打包应用从非仓库 cwd 启动，cwd 中故意放坏 journal，仍通过实际 packaged resources
完成初始化；退出后开发 Electron 只读检查隔离库的完整 legacy/Drizzle 台账和 FK/integrity。
5个坏资源场景仅在临时副本上调用生产 loader/initializer，在创建数据库之前失败，
不是启动损坏安装包的证明。生产 executable 的 RunAsNode 保持关闭。

产物：`algo-electron/release/2.0.1/AlgoLearningPlatform-Windows-2.0.1-x64-Setup.exe`。
日志：忽略目录 `algo-electron/tmp/drizzle-a1-{all,build,duplication}.log`。
基线SHA256仍为 `b92f46f0e3cf2258b73dd4c1845c4646640b2f7d98309ef96d681bbf2bc20216`。

构建有现有大 chunk 提醒，以及测试入口 fallback URL 的构建期路径提醒；生产传显式资源
路径，真实打包冒烟已验证该路线。本次未执行安装向导/卸载或用户真实 profile 升级。

## 后续

提交推送后跟进 PR #8 CI。A2先转换题目总览的四个只读查询，保持过滤/时间/同步接口；
复杂读写、nullable ID策略、omnibox和目录迁移分别验收。未来非baseline schema版本需要
自己的物理结构契约，当前不以旧基线或空库重放任意DML冒充未来schema验证。
