# 打包资源目录

## 1. 职责

`build/` 存放 electron-builder 使用的应用资源。当前主要用于 Windows 安装包图标，不承载运行时代码或用户数据。

## 2. 当前文件

- `icon.ico`：Windows 安装包和应用图标。
- `icon.png`：图标源图或辅助资源，用于后续生成其他平台图标。

## 3. 实现程度

`electron-builder.json5` 通过 `directories.buildResources: "build"` 读取本目录资源，Windows 配置使用 `build/icon.ico`。打包命令为：

```powershell
npm run build:win
```

输出目录为 `release/${version}`，不属于源码维护范围。

## 4. 修改边界

- 本目录只放可公开发布的应用资源。
- 不放 Cookie、session、`.env`、本地数据库、测试截图、用户源码或临时构建缓存。
- 替换图标后必须重新运行 `npm run build:win`，并按 `docs/release-process.md` 检查安装包图标、开始菜单和卸载入口。
- 新增平台资源时同步 `electron-builder.json5`、`algo-electron/README.md` 和 `docs/release-process.md`。

## 5. 验证入口

```powershell
cd algo-electron
npm run build:win
```

发布前还需要执行：

```powershell
npm run test:all
```
