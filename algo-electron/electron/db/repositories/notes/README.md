# Notes 数据查询与写入

## 1. 职责

通过公共 Drizzle builder 读取文件路径、更新标题/类型/正文、删除及创建笔记记录。
连接由 `NoteService` 在原位置取得并传入，helper 不打开、关闭、缓存或获取全局连接，
不执行文件操作，也不接管时钟、通知或事务。

## 2. 当前实现与边界规则

- `file-path.ts` 返回查询行或 `undefined`，空文件路径仍是命中，不能以路径真值判断缺失。
- 路径查询只选一列、绑定一个 ID、执行一次 `get()`，不添加软删除过滤、LIMIT 或 ID 清洗。
- 保留原生 NULL 等值行为与同步异常；损坏表结构的引号错误文案可能不同，不翻译异常。
- `title-type.ts`、`delete.ts` 返回原生结果，service 保留两次 `changes` 判断。
- `content.ts` 用单行 CTE 保留四个绑定；service 保留 catch 边界并忽略原生结果。
- `create.ts` 用单行 CTE/INSERT SELECT 保留九个绑定，工厂立即准备，再读取第二组输入；通知后第三次读取及构造结果仍由 service 执行。
- 创建显式插入 `deleted_at=NULL` 只按当前 030 无默认值结构验证，不承诺任意手改结构等价。完整列表/详情的三处原生 SQL 暂留 service。
- 不改变文件先于写库的顺序、异常捕获位置、通知或调用方事务。数据库回滚不恢复文件。

## 3. 验证

`pnpm test:db` 包含独立原 SQL 差分、原生 Electron 查询及真实应用存储验收。
`notes-file-path-storage.test.ts` 使用隔离临时 userData/数据库/文件，不打开用户数据。
完整契约见 `.trellis/spec/project/` 的 `drizzle-notes-file-path.md`、
`drizzle-notes-title-type.md`、`drizzle-notes-delete.md`、`drizzle-notes-content.md`
和 `drizzle-notes-create.md`。
