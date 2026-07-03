# Notes 模块说明

## 1. 职责

`electron/notes/` 是本地 Markdown 笔记服务，负责笔记 DB 记录、Markdown 文件、图片附件和删除清理。

本模块不解析 OJ 页面，不生成 AI 内容，不直接注册 IPC。Renderer 访问笔记能力的 IPC 注册在 `electron/ipc/registerNotesIpc.ts`，数据库表结构由 `DATABASE_SCHEMA.md` 和 notes migrations 管理。

## 2. 当前实现程度

当前包含：

- `NoteService.ts`：笔记 DB 记录和文件 helper 的编排服务。
- `noteStorage.ts`：Markdown 文件、附件目录、图片保存、附件路径解析和文件删除。
- `noteText.ts`：笔记正文展示用字数估算。
- `noteAssetProtocol.ts`：注册 `note-asset://` 协议，让 renderer 能安全读取已保存的本地图片附件。

`NoteService.ts`：

- 支持创建题目笔记和独立笔记。
- 笔记正文同时写入 Markdown 文件和 DB 缓存，文件写入通过 `noteStorage.ts` 完成。
- 支持按题目、全量列表、单条详情读取。
- 支持更新标题、正文、类型。
- 支持保存图片附件并返回 Markdown 相对路径。
- 支持安全解析附件路径。
- 支持删除单条笔记或题目关联笔记。

`noteAssetProtocol.ts`：

- 在 app ready 前注册 `note-asset` privileged scheme。
- 在 app ready 后注册协议 handler。
- 只接受 `note-asset://local/{noteId}/...` 格式，并通过 `resolveNoteAssetPath()` 解析本地路径。
- 找不到附件时返回 404，路径非法时返回 400。

`noteStorage.ts`：

- `createNoteFile()` 创建 `notes/{problemId}/{noteId}.md`。
- `writeNoteContent()` / `readNoteFile()` 处理 Markdown 文件读写。
- `saveNoteImageAsset()` 保存图片到 `assets/{noteId}/` 并返回 Markdown 相对路径。
- `resolveNoteAssetPathFromFile()` 对 `note-asset://` 的相对路径做白名单和路径穿越检查。
- `deleteNoteFiles()` 删除 Markdown 文件和对应附件目录，清理失败不阻塞 DB 删除。

`noteText.ts`：

- `countWords()` 用于中英文混排字数估算；中文按字，英文和数字按词。

## 3. 存储模型

- 根目录：`app.getPath('userData')/notes`。
- 笔记文件：`notes/{problemId}/{noteId}.md`。
- 图片附件：`notes/{problemId}/assets/{noteId}/{generatedName}.{ext}`。
- DB 表：`notes`。

DB 中的 `content` 是正文缓存；Markdown 文件是外部编辑器可直接打开的本地文件。

## 4. 核心函数

- `createNote(input)`：创建 DB 记录和 Markdown 文件。
- `getNotesByProblem(problemId)`：读取某题笔记列表。
- `getAllNotes()`：读取全部笔记。
- `getNoteWithContent(noteId)`：读取单条笔记，必要时回读文件。
- `updateNoteTitle(noteId, title)`：更新标题。
- `updateNoteContent(noteId, content)`：更新正文、文件和字数。
- `saveNoteImage(noteId, fileName, mimeType, data)`：保存图片附件。
- `resolveNoteAssetPath(noteId, relativeUrl)`：把 Markdown 相对路径安全解析为本地文件路径。
- `updateNoteType(noteId, noteType)`：更新笔记类型。
- `deleteNote(noteId)`：删除 DB 记录、Markdown 文件和附件目录。
- `getNotesByProblemForDelete(problemId)`：删除题目前查询关联笔记。
- `deleteNotesByProblem(problemId)`：用户确认后批量删除题目笔记。
- `openNotesDir()`：返回并确保笔记根目录存在。
- `registerNoteAssetSchemeAsPrivileged()`：注册 `note-asset` scheme 权限，必须在 `app.whenReady()` 前调用。
- `registerNoteAssetProtocol()`：注册本地附件读取 handler，必须在 Electron ready 后调用。
- `createNoteFile(problemId, noteId, title, content)`：创建 Markdown 文件。
- `saveNoteImageAsset(noteFilePath, noteId, fileName, mimeType, data)`：保存图片附件。
- `resolveNoteAssetPathFromFile(noteFilePath, noteId, relativeUrl)`：从已知笔记文件路径解析附件绝对路径。
- `countWords(text)`：估算笔记正文展示字数。

## 5. 安全规则

- `resolveNoteAssetPath()` 必须保持路径穿越防护。
- 图片附件只允许白名单扩展名。
- `NoteService.ts` 只允许通过 `noteStorage.ts` 访问 Markdown 文件和附件目录，避免分散路径拼接。
- 删除题目时不应静默删除笔记，必须先让 UI 确认。
- 不要把笔记正文混入提交监测或 Cookie 日志。
- `note-asset` handler 不允许绕过 `resolveNoteAssetPath()` 直接拼本地路径。
- `note-asset` 协议只读本地附件，不创建、修改或删除文件。

## 6. 测试入口

当前没有独立 notes 单元测试。修改后至少运行：

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
```

涉及文件读写时需要手测创建、编辑、插图、删除和外部打开目录。
