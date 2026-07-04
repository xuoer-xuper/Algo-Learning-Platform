# 安卓端只读数据接口设计

## 1. 职责

本文为未来安卓端或移动端只读查看学习数据预留数据接口。当前仓库不实现安卓应用，也不提供云服务；移动端读取应基于用户主动导出的 JSON 文件或未来受控同步通道。

## 2. 数据格式

移动端 v1 只读输入使用 `electron/backup/learningDataExport.ts` 生成的 JSON：

- `app`: `algo-learning-platform`
- `schema_version`: `1`
- `exported_at`: 导出时间
- `metadata.excluded`: 当前导出明确排除的数据类型
- `tables`: 学习数据表数组

首批只读页面可依赖：

- 题目列表：`tables.problems`
- 访问历史：`tables.problem_visits`
- 提交历史：`tables.submissions`
- 每日趋势：`tables.user_daily_stats`
- Codeforces 账号：`tables.platform_accounts`
- Rating 曲线：`tables.rating_history`

## 3. 只读边界

- 安卓端不得直接读取桌面端 SQLite 用户数据目录。
- 安卓端不得读取或请求桌面端 Cookie、session、csrf token、登录态摘要或 `cookie_records`。
- 安卓端不得修改导出的 JSON 后自动回写桌面端；回写必须走桌面端导入预览和冲突确认。
- 若未来使用云同步，仍必须保持 Cookie 不同步、`raw_json` 不同步和用户确认冲突策略。

## 4. 兼容策略

- 移动端必须检查 `app` 和 `schema_version`，不认识版本时拒绝读取并提示用户升级。
- 字段缺失时按只读降级处理，不补写默认值到原文件。
- `problem_id`、`account_id` 是导出文件内部引用；跨库导入时桌面端会负责重新映射，移动端只读展示不应假设这些 ID 跨设备稳定。

## 5. 验证入口

```powershell
cd algo-electron
npm run test:db
npm run test:docs
```

未来真正实现安卓端前，应补充 JSON fixture、移动端 schema 校验测试和人工隐私审计。
