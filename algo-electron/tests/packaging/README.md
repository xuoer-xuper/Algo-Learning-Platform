# Packaging Tests 说明

## 1. 职责

`tests/packaging/` 存放打包配置静态检查。它不生成安装包，只验证 `electron-builder.json5` 和 `package.json` 中的发布安全边界，防止后续改动把开发目录、敏感文件或原生模块配置破坏掉。

## 2. 当前检查

`check-packaging.mjs` 当前覆盖：

- `asar` 开启。
- 打包入口只包含 `dist/`、`dist-electron/` 和 `package.json`。
- 排除日志、本地数据库、`.env`、`tmp/`、`tests/` 和 `release/`。
- `better-sqlite3` 原生 `.node` 文件通过 `asarUnpack` 解包。
- Windows 目标为 NSIS x64，并使用 `build/icon.ico`。
- NSIS 卸载不删除用户数据。
- `build` 和 `build:win` scripts 保持标准命令。

## 3. 验证入口

```powershell
cd algo-electron
npm run test:packaging
```

发布前使用：

```powershell
npm run test:all
npm run build:win
```

## 4. 维护边界

- 新增打包资源、原生依赖或输出目录时，同步 `electron-builder.json5`、`docs/release-process.md` 和本检查。
- 不把 Cookie、用户源码、完整请求体、本机数据库、`.env` 或可复用登录态纳入打包输入。
- 本检查不能替代真实安装、升级、卸载和产物解包验收。
