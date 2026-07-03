# Adapter Shared Helpers

## 1. 职责

`electron/adapters/shared/` 放站点 adapter 之间复用的提交解析 helper。它面向 adapter 内部使用，不是主进程通用工具层。

本目录不注册站点、不注入脚本、不写数据库，也不决定提交是否可以入库；入库边界由 `electron/submissions/` 的 watcher 和 writer 负责。

## 2. 当前实现程度

当前文件：

- `genericSubmission.ts`：兼容入口，只 re-export 本目录公开 helper，外部 adapter 仍可从旧路径导入。
- `text.ts`：通用文本清洗、耗时/内存/语言解析和表头定位。
- `tables.ts`：通用提交表格选择、扫描和实时表格 payload 解析。
- `frontendVerdict.ts`：兼容入口，只 re-export 前端 verdict 相关 helper。
- `frontendVerdictPayload.ts`：前端 verdict payload、自测过滤和提交 ID 兜底解析。
- `frontendVerdictHook.ts`：通用 DOM observer 注入脚本生成。

## 3. 核心封装

当前对外函数：

- `stripHtml(value)`：移除 HTML 标签并压缩空白。
- `parseRuntimeMs(raw)`：解析毫秒耗时。
- `parseMemoryKb(raw)`：解析 KB 内存。
- `extractLanguage(raw)`：从混合文本中提取语言。
- `findColumnIndex(headers, keywords)`：按表头关键词定位列。
- `scanBestTable(tables, platform, prefix, ctx)`：选择最像提交记录的表格并解析提交。
- `parseRealtimeTablePayload(raw)`：解析实时 hook 上报的表格 payload。
- `parseFrontendVerdictPayload(raw)`：解析前端结果面板 payload。
- `createFrontendVerdictHookScript(adapterId)`：生成通用前端 verdict observer 注入脚本。

## 4. 边界规则

- 新增站点专用规则优先放入 `sites/{site}/`，只有确实跨站复用才放到这里。
- 外部 adapter 优先继续从 `shared/genericSubmission` 导入，避免一次性扩大 import 改动面。
- `parseFrontendVerdictPayload()` 不能用于 Nowcoder 和 VJudge 实时入库路径，这两个站点必须网络结果驱动。
- `frontendVerdictHook.ts` 是浏览器注入脚本生成器，改动时必须复测 submit intent、pending 延迟和自测过滤。
- helper 可以返回 `SubmissionData` 候选，但不能写数据库或刷新统计。
- 注入脚本不得记录 Cookie、用户源码或完整请求体。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

改动表格、verdict 或 observer 逻辑时运行 adapter 和 submissions 相关测试，并复测受影响站点的 pending/final/duplicate 场景。
