# Context Menus

## 职责

本目录集中定义浏览器壳层原生菜单，避免 DOM 菜单被 `WebContentsView` 遮挡，并为 B2.8 的页面、标签与编辑区右键菜单保留统一扩展点。

## 当前实现与覆盖范围

- `appMenu.ts`：工具栏三点菜单。只接收经过严格校验的窗口内整数坐标，当前提供 Chrome 风格缩放档位、学习统计、Coach 指标、脚本管理和设置入口；命令通过注入回调打开内部标签或调用 TabManager 缩放，不直接依赖全局状态。
- `browserContextMenu.ts`：B2.8 页面、标签、壳内编辑区和内部页空白处菜单。所有模板均使用原生 `Menu.popup()`，页面参数只读取受限的链接、图片、选中文本和 editFlags；图片另存为继续复用 DownloadManager 的 `downloadURL` 路径，地址栏额外提供“粘贴并前往”。页面菜单会从 `UserScriptMenuRegistry` 读取当前 webContents 的活动命令并组成“用户脚本”子菜单。

## 边界与维护规则

- 页面、标签、编辑区和应用菜单都应复用本目录的原生 `Menu.popup()` 基础设施，不在 renderer 另造会被 view 遮挡的 DOM 菜单。
- 菜单模块只组装白名单模板和分发注入命令；运行期窗口、TabManager、下载器或设置服务由 IPC 注册层注入。
- renderer 提供的坐标和上下文 payload 必须先做 exact-shape、类型和长度校验，菜单项不得直接信任页面文本、URL 或文件路径。
- 页面右键中的链接、图片和搜索动作必须重新经过 TabManager 导航策略；复制、编辑、关闭范围与“移到新窗口”动作通过注入回调执行，不把 BrowserWindow 或 WebContents 暴露给 renderer。
- 用户脚本菜单项必须绑定活动 MessagePort 和精确 webContents；端口关闭、reload、generation 更新或标签销毁后立即清理，不能缓存页面提供的任意原生菜单模板。
