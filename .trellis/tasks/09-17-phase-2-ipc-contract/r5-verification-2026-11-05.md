# R5 Unix 毫秒迁移最终验收（2026-11-05）

## 交付范围

分支 `feat/db-unix-ms-timestamps`，PR #7 基于尚未合并的 R1-R4 PR #6。
030 将25张表82个时间列（含迁移台账）转换为 INTEGER；主进程生产者、repository、
shared schema、IPC、renderer 与备份/AI上下文同步数值化。日期键、时长、HTTP validator、
任意用户JSON不改语义；001–029与固定历史SQL快照不修改。

## 完成内容

- 严格 local/UTC+8/offset 解析、epoch0/null、日历边界与三个时区/DST矩阵；保留旧迁移
  formatter和旧阶段台账兼容，普通业务不再写格式化时间。
- 030外键状态在事务外受控切换，整次重建保留表/外键/索引/CHECK/UNIQUE/rowid/view/trigger
  与BLOB，提交前检查；失败回滚、恢复SQLite一致备份、failure marker禁止盲目重试。
- 日统计显式DB参数重算，修正跨日分组；AI JSON仅转换四类已知时间路径，schema版本同步。
- 学习JSON v2输出毫秒，旧v1在预览前规范化，兼容真实v1仅有excluded的metadata；非法必需时间
  不写库。站点配置v2数值导出与v1/v2导入闭环。
- 全部跨IPC时间点含诊断、下载、安装请求、Coach状态改为整数；renderer只在展示边界格式化。
  旧R4刷新、草稿、live-wins与安全边界保持。

## 独立复核修复

1. 外键恢复异常不覆盖原始迁移失败，成功日志仅在恢复完成后输出；两条回归。
2. 最近站点预连接遗漏的TEXT日期cutoff改为INTEGER本地午夜；Luogu上游epoch0不再被视为缺失。
3. 实际副本发现早期洛谷直接绑定毫秒数到TEXT，产生`.0`文本；Git `5f0c96c`证明来源，
   `5207d3a`只修后续写入。严格兼容整数`.0+`，不猜单位、不重复乘1000、非法小数继续拒绝。
4. 原统计`substr(timestamp,1,10)`曾形成十位数字伪日期桶。030仅移除该已知派生缓存形状后
   按事实重建，原缓存留在备份；其他非法日键仍失败，合法桶元数据与事实行保留。
5. 清理遗漏测试注解与格式，补v1 metadata真实结构兼容，不以类型断言隐藏错误。

历史证据见 `research/r5-numeric-text-provenance.md`。最初两次真实副本验证因不支持格式而
安全失败并恢复，是发现兼容缺口的证据；最终验证使用重新生成的新副本，不删除marker重试。

## 分层验证

| 验证 | 结果 |
| --- | --- |
| `pnpm test:all` | 退出0；192文件/1563用例，真实Electron/DB/AI/Coach套件通过 |
| Playwright | 11/11，含真实同步两秒刷新与原生交互门禁 |
| 应用/测试TypeScript、lint | 通过 |
| Architecture / security / docs | 21/21及相关检查通过 |
| jscpd | 1.66%，低于3% |
| `pnpm build:win` | 退出0；NSIS安装包生成、production fuses/SQLite/单实例打包冒烟通过 |
| 打包程序旧库升级补测 | 使用重建rc.1 schema29+已有合成事实启动win-unpacked，升30并保留准确epoch，FK/integrity通过 |
| `git diff --check` | 通过 |

覆盖率：statements74.64%、branches68.55%、functions71.60%、lines77.86%。
构建产物在忽略目录 `algo-electron/release/2.0.1/`，本次只是验收构建，未发布、未打tag、未改版本。

## 真实副本验证（不提交私密数据）

仅对本机原件以只读连接使用SQLite backup API复制到新的忽略临时目录，再让生产安全初始化
入口迁移副本。没有运行应用指向原profile，没有打印私密行、提交数据库文件或复制内容到文档。
验证前后原DB与已有WAL的SHA256一致。

| 样本类别 | 起点→终点 | 时间列检查 | 独立时间值对照 | 保持行数的原事实表 | 独立日统计核对 |
| --- | --- | --- | --- | --- | --- |
| 当前实际库的隔离副本 | 29→30 | 82列INTEGER，非空存储integer | 1407个值一致 | 23张 | 56个合法日桶、6指标与平台分布一致 |
| 实际迁移前备份的隔离副本 | 24→30 | 82列INTEGER，非空存储integer | 1097个值一致 | 18张 | 53个合法日桶、6指标与平台分布一致 |

两者FK检查均为空、integrity均ok。五个十位伪日期旧缓存分别从两份副本中按明确规则消除，
已按最终事实独立重建。原件没有被迁移。

覆盖限制：82列全部验证结构和非空存储类型，但预留/nullable列并非每列都有真实非空样本。
历史重建用合成数据，实际24/29样本也不是声称不可变的精确release-era快照；证据分开报告。
DST fold采用明确较早时刻策略，无法从旧无后缀字符串恢复已经丢失的信息。

## 可复核本地记录

均位于忽略的 `algo-electron/tmp/`：

- `r5-release-all-20261105.log`：最终全量检查。
- `r5-build-win-20261105.log`：Windows构建和打包冒烟。
- `r5-packaged-legacy-upgrade.log`：打包应用schema29→30补测。
- `r5-real-copy-20261105-final/migration-report.json`、`independent-stats-report.json`：只含聚合验收结果。
- `r5-real-copy-20261105-final/copy-report.json`：本地原件未变哈希证据，不进入Git。

## 集成状态

2026-11-06 收口确认：功能提交 `e789841`、Windows 提交参数分批修复 `682231d` 已推送，
对应 CI `42195138160`、`42197937618` 全绿。提交钩子保留完整检查，只将 lint-staged
命令分批上限设为6000，为Windows `.cmd` shim与引号留出余量。

PR #7 已转为 ready for review，仍基于未合并的 PR #6。阶段2代码工作无剩余项；等待授权
按依赖顺序集成后再归档，不擅自合并、发布或归档为已集成。
