# Problems Feature

## 1. 职责

`src/features/problems/` 负责题目列表、题目详情、提交记录展示和本地 Markdown 笔记的 renderer 层。

本目录不解析 OJ 页面、不写数据库、不读写附件文件；持久化、图片保存和题目删除必须通过 preload 白名单能力进入主进程。

## 2. 当前实现程度

- `ProblemSidebar.tsx`：题目侧栏、筛选、导航和侧栏宽度通知。
- `ProblemDetail.tsx`：题目详情、访问统计、提交记录和删除确认。
- `NotePanelModal.tsx`：题目笔记弹层入口。
- `NoteList.tsx`：笔记列表和新建/选择/删除操作。
- `NoteEditorPane.tsx`：笔记标题、类型和正文编辑面板。
- `MilkdownEditor.tsx`：Markdown 编辑器和图片上传接线。
- `useDebouncedNoteTitleSave.ts`：笔记标题防抖保存、切换前 flush、卸载 flush 和删除 pending 清理。
- `problemsApi.ts` 集中封装本 feature 的 preload 调用。
- `problemTypes.ts`、`notesTypes.ts` 收敛题目和笔记展示类型。

## 3. API 封装

`problemsApi.ts` 当前对外封装：

- 题目列表与详情：`loadRecentProblems()`、`loadProblemDetail()`、`subscribeProblemsUpdated()`、`setProblemSidebarWidth()`。
- 题目删除：`loadNotesForDelete()`、`deleteNotesByProblem()`、`deleteProblemRecord()`。
- 导航：`navigateToProblemUrl(url)`。
- 笔记 CRUD：`listNotesByProblem()`、`createProblemNote()`、`loadNote()`、`updateNoteContent()`、`updateNoteType()`、`updateNoteTitle()`、`deleteNote()`。
- 附件：`saveNoteImage()` 返回可写入 Markdown 的图片 URL；`openNotesDirectory()` 打开笔记目录。

## 4. 边界规则

- 提交记录只展示主进程返回数据，不在 renderer 中解析提交页。
- 删除题目需要先处理关联笔记，不能绕开 `problemsApi.ts` 直接调用多个 preload 方法。
- 笔记标题保存逻辑必须通过 `useDebouncedNoteTitleSave()` 统一处理。
- 图片上传不得暴露本地绝对路径给 Markdown 正文，使用主进程返回的 markdown URL。
- 新增题目/笔记 IPC 时同步 `problemsApi.ts`、类型文件和 `electron-env.d.ts`。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npx --yes tsx tests\ui\rendererScreenshots.test.ts
```

涉及笔记时手测新建、切换、标题防抖保存、图片上传、删除和打开目录；涉及题目删除时确认提交记录和统计不异常。
