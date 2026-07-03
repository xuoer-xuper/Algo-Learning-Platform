# Home Feature

## 1. 职责

`src/features/home/` 负责应用首页的 renderer 展示层，包括学习概览、最近访问题目、复习建议和常用入口。

首页只消费主进程提供的事实数据和建议结果，不直接读取数据库、不抓取网页、不维护长期缓存。

## 2. 当前实现程度

- `HomePage.tsx` 是首页入口，负责加载首页数据、响应题目更新事件和触发导航回调。
- `homeApi.ts` 集中封装首页需要的 preload 调用。
- `homeTypes.ts` 定义首页展示数据类型。

## 3. API 封装

`homeApi.ts` 当前对外封装：

- `loadHomeOverviewStats()`：读取首页概览统计。
- `loadHomeRecentProblems(limit)`：读取最近访问题目。
- `loadHomeRecommendations(limit)`：读取复习建议。
- `subscribeHomeProblemsUpdated(callback)`：订阅题目更新事件，并返回 cleanup 函数。

## 4. 边界规则

- 首页展示的统计口径不得在 renderer 内重算。
- 事件订阅必须在 effect cleanup 中取消。
- 首页导航通过父级传入的 `onNavigate(url)` 完成，不直接管理浏览器标签状态。
- 新增首页数据时先扩展 `homeApi.ts` 和 `homeTypes.ts`。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests\ui\rendererScreenshots.test.ts
```

涉及交互时启动 `npm run dev`，手测首页加载、题目更新后刷新、空数据和导航入口。
