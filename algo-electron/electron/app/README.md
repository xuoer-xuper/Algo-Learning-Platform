# App 模块说明

## 1. 职责

`electron/app/` 存放主进程应用级配置。它只负责本地配置文件读写，不承担浏览器、数据库、站点适配或 IPC 注册逻辑。

## 2. 当前实现程度

当前只有 `config.ts`：

- 配置文件位置：`app.getPath('userData')/config.json`。
- 默认配置：`defaultHomeUrl = https://codeforces.com`。
- 读取时会与默认配置合并。
- 写入时保存格式化 JSON。

## 3. 函数说明

- `loadConfig()`
  - 懒加载配置文件。
  - 文件不存在或 JSON 解析失败时回退默认配置。
- `saveConfig(partial)`
  - 与当前配置合并后写回 `config.json`。
- `getDefaultHomeUrl()`
  - 返回默认首页 URL。

## 4. 边界规则

- 新增配置项必须给出默认值。
- 配置项不应保存 Cookie、token、用户源码或大体积数据。
- 配置 schema 如果变复杂，应补版本字段和迁移策略。
- 与数据库 schema 无关的轻量用户偏好可以放这里；事实数据必须进 SQLite repository。

## 5. 测试入口

当前没有独立 app 配置测试。修改该模块后至少运行：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```
