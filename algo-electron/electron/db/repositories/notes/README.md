# Notes 文件路径查询

## 1. 职责

`file-path.ts` 只提供 `findNoteFilePath(db, noteId)`：通过公共 Drizzle builder
按原生等值绑定读取 `notes.file_path`。连接由 `NoteService` 在原位置取得并传入，
helper 不打开、关闭、缓存或获取全局连接，不执行文件操作。

## 2. 当前实现与边界规则

- 返回查询行或 `undefined`，空文件路径仍是命中，不能以路径真值判断缺失。
- 只选一列、绑定一个 ID、执行一次 `get()`，不添加软删除过滤、LIMIT 或 ID 清洗。
- 保留原生 NULL 等值行为与同步异常；损坏表结构的引号错误文案可能不同，不翻译异常。
- 仅供正文更新、图片保存、附件解析和删除的前置读取；其余八处原生 SQL 暂留 service。
- 不改变文件先于写库的顺序、异常捕获位置、通知或调用方事务。数据库回滚不恢复文件。

## 3. 验证

`pnpm test:db` 包含独立原 SQL 差分、原生 Electron 查询及真实应用存储验收。
`notes-file-path-storage.test.ts` 使用隔离临时 userData/数据库/文件，不打开用户数据。
完整契约见 `.trellis/spec/project/drizzle-notes-file-path.md`。
