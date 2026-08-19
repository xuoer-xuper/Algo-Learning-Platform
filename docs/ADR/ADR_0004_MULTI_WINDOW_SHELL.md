# ADR-0004：完整对等壳窗口与集中所有权路由

## 状态

已接受（B3.1 所有权基础层与 B3.2 页面/服务多流语义已实施，B3.3-B3.5 继续完成过户、广播和生命周期）

## 背景

旧实现由 `electron/main.ts` 的模块级 `win` 和 `tabManager` 驱动，IPC、文件对话框、下载通知和事件推送都读取同一组 getter。历史 `DetachedWindow` 只承载一个远程 view，没有标签栏、工具栏、内部页、sender 归属或完整生命周期，因此拆出后不能与原窗口对等，也无法保证关闭原窗口后继续工作。

多窗口上线前必须先解决所有权问题，否则第二个可信 shell 会操作最后创建的 TabManager，异步对话框或下载结果也可能投递到错误窗口。

## 决策

1. 每个完整壳窗口由一个 `AppWindow` 表示，持有唯一 `BrowserWindow` 与唯一 `TabManager`。
2. `WindowManager` 是应用级窗口事实源，持有 `Map<windowId, AppWindow>`，维护最近聚焦窗口和窗口注销。
3. `ViewRegistry` 是 webContents 所有权事实源，记录 shell 与 web 标签的 `windowId/tabId/view`；所有生命周期路径必须同步更新。
4. 完整壳 IPC 先经过 origin/main-frame/payload 校验，再由中央 trusted sender registry 从 `event.sender` 解析所属 `AppWindow`。窗口、标签、菜单和对话框操作禁止猜测窗口或回退最近活跃窗口。
5. 事件默认定向发回所属壳；需要应用级广播的服务事件由 B3.4 显式实现，不能用全局主窗口 getter冒充广播。
6. 窗口 normal bounds 与 maximized 使用独立版本化 JSON 原子持久化；恢复时按当前显示器 workArea 校正完全越界和尺寸异常。
7. B3.1 保持单窗口行为。ContestGuard、Tracking、提交与 Coach 多流语义在 B3.2 就绪前，拖出、双击拆分和“移到新窗口”继续禁用；B3.3 才删除 `DetachedWindow` 并上线完整壳过户。
8. B3.2 的页面事件必须携带完整 owner 与顶层 URL；精确脚本 API 对窗口、标签、webContents 和 URL 做 stale 校验。Tracking 按窗口并行，ContestGuard 聚合所有窗口，Coach 单会话防抖跟随最近窗口，实时提交未知 owner fail closed。

## 影响

正面影响：

- sender、窗口、TabManager 和 WebContentsView 归属可测试且唯一。
- 后续标签过户可以在注册表中做显式 owner 迁移和失败回滚。
- 文件对话框、窗口按钮、下载通知和浏览器命令不会串到其他壳窗口。
- 显示器布局变化后不会恢复到不可见位置。

代价：

- `main.ts` 仍负责单窗口创建编排，B3.3/B3.5 还需继续下沉创建、过户和多窗口快照生命周期。
- 页面事件、Tracking、ContestGuard、实时提交、用户脚本和 Coach 已具备 B3.2 多窗口语义；`problems:updated` 广播、SessionTracker 任一窗口聚焦和 SyncService 活动窗口选择仍留在 B3.4。
- 窗口和标签的所有创建、替换、关闭路径都必须维护 ViewRegistry，不允许绕过。

## 执行要求

- 不得重新引入模块级 `win`/`tabManager` 单槽。
- 新增 shell IPC 的窗口敏感操作必须从 `event.sender` 解析 owner。
- B3.3 完成标签过户和对等壳拆分前不得启用拆分入口；过户顺序和回滚必须以 ViewRegistry 为事实源。
- 保持现有前端视觉基线；窗口所有权重构不改变颜色、字体、按钮形态、整体布局或动画基调。
