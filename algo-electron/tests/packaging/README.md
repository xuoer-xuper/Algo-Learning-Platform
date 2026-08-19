# Packaging Tests 说明

## 1. 职责

`tests/packaging/` 存放打包配置和主进程产物检查。它不生成安装包，只验证 `electron-builder.json5`、`package.json` 和已构建的 `dist-electron/main.js`，防止后续改动把开发目录、敏感文件或原生模块配置破坏掉。

## 2. 当前检查

`check-packaging.mjs` 当前覆盖：

- `asar` 开启。
- 打包入口只包含 `dist/`、`dist-electron/` 和 `package.json`。
- 排除日志、本地数据库、`.env`、`tmp/`、`tests/` 和 `release/`。
- `better-sqlite3` 的 `prebuilds/`、`build/Release/` 和 `bin/` 原生 `.node` 文件通过 `asarUnpack` 解包。
- `electronFuses` 固定生产安全基线：禁用 `runAsNode`、`NODE_OPTIONS` 和 Node inspect 参数，启用 Cookie 加密、ASAR 完整性校验与 `onlyLoadAppFromAsar`，并关闭 `grantFileProtocolExtraPrivileges`。
- Windows 目标为 NSIS x64，并使用 `build/icon.ico`。
- NSIS 卸载不删除用户数据。
- `build` 和 `build:win` scripts 保持标准命令。
- Vite 8 主进程产物保持 `better-sqlite3` 为运行时 external，不内联依赖 `__dirname` 的 native loader。
- Windows `win-unpacked` 使用隔离的临时 `userData` 启动，确认主窗口、preload、SQLite 和迁移可以工作。
- 同一隔离 `userData` 下真实启动第二个 `win-unpacked` 进程，确认失败实例快速退出、主实例保持运行并恢复聚焦，且失败实例不写共享日志。
- `checkPackagedApp.mjs` 使用 `@electron/fuses` 读取真实 executable，而不是只信任 JSON5 配置；这一步用于发现打包工具或缓存导致的 fuse 漂移。

## 3. 验证入口

```powershell
cd algo-electron
npm run test:packaging
npm run test:packaged-main
npm run test:packaged-app
```

`test:packaged-app` 需要先生成 `release/${version}/win-unpacked`。网络不可用时，可使用仓库中版本匹配的 `node_modules/electron/dist` 作为 `--config.electronDist` 做离线构建，但仍必须读取真实 executable 并完成双实例 smoke。

发布前使用：

```powershell
npm run test:all
npm run build:win
```

## 4. 维护边界

- 新增打包资源、原生依赖或输出目录时，同步 `electron-builder.json5`、`docs/OPERATIONS/RELEASE_PROCESS.md` 和本检查。
- 不把 Cookie、用户源码、完整请求体、本机数据库、`.env` 或可复用登录态纳入打包输入。
- `test:packaged-main` 必须在 `vite build` 后运行；静态检查不能替代真实安装、升级、卸载和产物解包验收。
- `test:packaged-app` 的双实例检查必须共用临时 `userData`，并在任一断言失败时释放 HTTP gate、终止残留进程后再删除临时目录。
