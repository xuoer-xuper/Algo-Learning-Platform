# Download Tests

## 1. 职责

`tests/downloads/` 覆盖 B2.7 下载模块的纯逻辑和最小 Session/DownloadItem 集成契约，不启动真实 Electron 下载或访问网络。

## 2. 当前覆盖

- `downloadPath.test.ts`：路径分隔符、Windows 保留名、非法/控制/双向文本字符、长度、受控目录、现存文件与并发预留重名。
- `downloadManager.test.ts`：固定保存路径、完成/取消结果、目录初始化失败、listener 摘除、观察者隔离和 `.user.js` 下载拦截。
- `userScriptNavigation.test.ts`：HTTPS `.user.js` 识别、loopback 开发例外、userinfo/协议拒绝、install route、过期、容量和 ID 校验。

## 3. 测试入口

```powershell
cd algo-electron
npm exec vitest run tests/downloads
```

`tests/verify.mjs` 的 core suite 同时包含本目录。

## 4. 边界规则

- fixture 只使用临时目录和示例 URL，不写真实下载目录，不访问远程站点。
- 不把响应正文、Cookie、header、用户脚本源码或本机绝对路径写入快照。
- Electron 真下载行为由后续接线 smoke 覆盖，本目录不伪造网络栈。

## 5. 维护要求

新增下载状态、文件名规则或 install registry 生命周期时，必须同步相应聚焦测试；接线新增 IPC 时另补 `tests/ipc/` 契约。
