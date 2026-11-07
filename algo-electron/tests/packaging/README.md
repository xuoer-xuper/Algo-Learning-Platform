# Packaging Tests 说明

## 1. 职责

`tests/packaging/` 存放打包配置、主进程产物和真实 Windows 应用检查。它不生成安装包；验证 `electron-builder.json5`、`package.json`、已构建的 `dist-electron/main.js` 以及 `win-unpacked`，防止开发目录、敏感文件、原生模块或数据库迁移资源的打包规则回退。

## 2. 当前检查

`check-packaging.mjs` 当前覆盖：

- `asar` 开启。
- 打包入口只包含 `dist/`、`dist-electron/` 和 `package.json`。
- 排除日志、本地数据库、`.env`、`tmp/`、`tests/` 和 `release/`。
- `extraResources` 只复制 `drizzle/*.sql` 和 `drizzle/meta/_journal.json` 到 `resources/drizzle`；不复制生成快照、README、测试或私有数据库。
- `better-sqlite3` 的 `prebuilds/`、`build/Release/` 和 `bin/` 原生 `.node` 文件通过 `asarUnpack` 解包。
- `electronFuses` 固定生产安全基线：禁用 `runAsNode`、`NODE_OPTIONS` 和 Node inspect 参数，启用 Cookie 加密、ASAR 完整性校验与 `onlyLoadAppFromAsar`，并关闭 `grantFileProtocolExtraPrivileges`。
- Windows 目标为 NSIS x64，并使用 `build/icon.ico`。
- NSIS 卸载不删除用户数据。
- `postinstall` 先装 Electron 二进制再重建 native 依赖，`build` / `build:win` 保持标准命令且在 `electron-builder` 之前先跑 `test:packaged-main`（只断言顺序，不钉死包管理器写法）。
- `pnpm-workspace.yaml` 保持 `nodeLinker: hoisted`、`shamefullyHoist: true` 和 `allowBuilds` 白名单：pnpm 12 只从这里读项目设置，缺条目会以 `ERR_PNPM_IGNORED_BUILDS` 直接安装失败而不是警告。
- Vite 8 主进程产物保持 `better-sqlite3` 为运行时 external，不内联依赖 `__dirname` 的 native loader。
- Windows `win-unpacked` 使用隔离的临时 `userData` 启动，确认主窗口、preload、SQLite 和迁移可以工作。
- 同一隔离 `userData` 下真实启动第二个 `win-unpacked` 进程，确认失败实例快速退出、主实例保持运行并恢复聚焦，且共享日志留下拒绝第二实例的诊断记录。
- `checkPackagedApp.mjs` 使用 `@electron/fuses` 读取真实 executable，而不是只信任 JSON5 配置；这一步用于发现打包工具或缓存导致的 fuse 漂移。
- 真实打包应用从仓库之外的临时工作目录启动，该目录故意放入无效 Drizzle journal；ASAR 检查同时排除应用根目录里的源迁移副本，防止错误的 cwd / app-root 路径侥幸通过。
- `verify-migration-resources.ts` 在应用退出后使用开发版 Electron 的 Node 模式只读检查隔离数据库：legacy 1–30 完整、Drizzle hash/时间台账与编译历史完全一致、FK 和完整性检查通过。生产 executable 的 `RunAsNode` fuse 保持禁用。
- 同一 helper 校验实际 `resources/drizzle` 文件集合、journal 和 SQL hash，再在全新临时副本上删除或篡改 journal/SQL。生产 loader 和安全初始化器必须在创建目标数据库及备份目录前拒绝。这些是 **copied-resource loader/initializer 负向检查**，不是启动损坏安装包的证明；原始打包资源始终不修改，并在检查后再次校验。

## 3. 验证入口

```powershell
cd algo-electron
pnpm run test:packaging
pnpm run test:packaged-main
pnpm run test:packaged-app
```

`test:packaged-app` 需要先生成 `release/${version}/win-unpacked`。网络不可用时，可使用仓库中版本匹配的 `node_modules/electron/dist` 作为 `--config.electronDist` 做离线构建，但仍必须读取真实 executable 并完成双实例 smoke。

发布前使用：

```powershell
pnpm run test:all
pnpm run build:win
```

## 4. 维护边界

- 新增打包资源、原生依赖或输出目录时，同步 `electron-builder.json5`、`docs/OPERATIONS/RELEASE_PROCESS.md` 和本检查。
- 不把 Cookie、用户源码、完整请求体、本机数据库、`.env` 或可复用登录态纳入打包输入。
- `test:packaged-main` 必须在 `vite build` 后运行；静态检查不能替代真实安装、升级、卸载和产物解包验收。
- `test:packaged-app` 的双实例检查必须共用临时 `userData`，并在任一断言失败时释放 HTTP gate、终止残留进程后再删除临时目录。
- 不增加可重定向生产 SQL 的环境变量；测试资源注入只通过安全初始化器的显式 `drizzle.folder` 参数。所有变更、清理和 SQLite 读取仅针对本次生成的临时测试目录。
