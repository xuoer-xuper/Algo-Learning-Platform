# Downloads

## 1. 职责

`electron/downloads/` 负责普通网页下载的受控落盘策略，以及 `.user.js` 导航进入脚本安装确认页之前的短时请求登记。下载内容不进入数据库、配置或标签会话快照。

## 2. 当前实现

- `downloadPath.ts`：文件名净化、应用下载目录派生、目录穿越防护、现存文件与并发下载重名分配。
- `DownloadManager.ts`：可注入 Session/DownloadItem 最小接口的 `will-download` 管理器，固定 `setSavePath()` 并广播完成、取消、中断结果；可在路径分配前拦截受管的 `.user.js` 下载。
- `userScriptNavigation.ts`：只识别 HTTPS（开发可显式放行 loopback HTTP）的 `.user.js` URL；短时 registry 生成受校验 `installId` 和 `script-install` 内部页路由。
- `index.ts`：模块统一导出入口。

## 3. 封装入口

- `getManagedDownloadDirectory(userDataPath)`：返回 `userData/downloads` 受控目录。
- `sanitizeDownloadFilename(name)`：移除路径、控制/双向文本字符和 Windows 非法字符，处理保留名与长度。
- `DownloadPathAllocator.reserve(name)`：在受控目录分配 `name`、`name (1)` 等唯一目标并预留并发槽位。
- `DownloadManager.attachSession(session)`：安装 `will-download` listener；`addResultListener()` 订阅不含远程响应内容的结果元数据。
- `DownloadManager` 的 `interceptDownload` 回调只接收 URL、净化文件名和来源 `webContents`；返回 `true` 时先 `preventDefault()`，由 TabManager 转入 `script-install`，避免脚本正文进入普通下载目录。
- `resolveUserScriptNavigation(url)` / `PendingUserScriptInstallRegistry`：识别脚本 URL，并创建短时安装确认路由。

## 4. 边界规则

- 主进程接线必须把 `app.getPath('userData')` 传给 `getManagedDownloadDirectory()`；不得采用网页提供的绝对路径或目录片段。
- 普通下载只保存到受控目录，不弹原生保存对话框；重名不得覆盖已有文件或活动下载。
- `.user.js` 导航不能作为普通下载落盘；TabManager 在直接导航、重定向、popup 和 `will-download` 路径登记 install request，再切换到 `algo://script-install?...`。
- Registry 只保存 URL、净化后的来源文件名和短时 ID，不保存脚本源码、Cookie、header 或凭据；确认/取消/过期后必须消费或删除。
- 下载结果进入 renderer 时只发送本模块的结果结构，不附带请求 header、响应正文或原始远程 URL。

## 5. 验证入口

```powershell
cd algo-electron
npm exec vitest run tests/downloads
npm run typecheck
npm run test:security
```

接线完成后追加真实 Electron 手测：普通文件成功/取消/中断、同名并发下载、离线失败，以及 `.user.js` 当前标签和新标签导航。
