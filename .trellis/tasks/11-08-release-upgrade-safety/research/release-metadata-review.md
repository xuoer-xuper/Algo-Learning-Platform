# 2.0.1 发行元数据独立复核

日期：2026-11-17（Asia/Shanghai）。检查基线 `d8b56205db5b547e1a35daeaaa5876ee96c7d50a`；
范围为当前 CHANGELOG、RELEASE_PROCESS、任务人工验收记录及 Git 发布规范的文档差异。
旧 phase3 注入与本任务不符，按 release task 的 check.jsonl 和规划文件加载。未运行安装器、
构建、全量测试、Git 写操作或发布操作；未访问用户 profile。

## Findings (fixed)

- `docs/PRODUCT/CHANGELOG.md` 末行混入单个 CRLF，独立 Prettier 检查拒绝；只将末行改为 LF。
  未改历史内容。生成的 2.0.1 段落、重复标题及旧“未发布”标签已由实现者正确整理。

## Findings (not fixed)

限定元数据范围无遗留问题，不代表最终 master 已可直接公开。

- 使用实际 `releaseNotes()` 提取 2.0.1，确认完整兼容性段进入 Release 正文，版本标题唯一。
- 学习数据、AI 上下文、站点配置三种 v2/整数 Unix 毫秒导出均已披露；学习/站点 v1/v2
  导入、旧应用/解析器不能读取新 v2、向前修复、恢复点不含新增数据和非完整备份边界明确。
- 2.0.0 起的历史内容逐字比较相同，仅旧“未发布”标题改为“历史补记（已包含于 2.0.0）”。
  没有将已发布 note/Coach/import/pet 修复重新计入 2.0.1。
- `algo-electron/` 和 `.github/` 相对用户已测试的 d8b5620 无差异。继续复用既有产品/兼容
  审核与维护者整体反馈有据可查；人工记录没有逐站结果，也没有冒称 agent 实测。
- 本轮合并、tag、草稿、公开授权已恢复；最终 master 的自动门、安装验收、资产/源码对应和
  远程后验仍必须由主会话完成。历史失败和旧暂停记录保留，不重写为曾经通过。

## Verification

Node 22.23.2 / pnpm 12.8.1，命令均退出 0：

- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run typecheck:tests`
- `pnpm run test:docs`
- 两份发行文档 `pnpm exec prettier --check`（修复末行后）
- `git diff --check`
- Node 断言：实际发行正文提取、三类格式披露、唯一 H1、历史内容一致、产品/CI 树未变。

这是准备提交的独立复核，不是最终 master/安装资产通过证明；后续证据需绑定最终提交与哈希。
