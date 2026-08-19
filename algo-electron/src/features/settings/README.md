# Settings Feature

## 1. 职责

`src/features/settings/` 负责设置内部页 renderer 层，包括地址栏搜索、学习概览、Codeforces 同步、实时提交诊断、备份导入导出、站点配置、账户管理和导入导出。

本目录不持久化配置、不读取 Cookie、不执行提交同步逻辑，只通过 preload 白名单调用主进程能力。

## 2. 当前实现程度

- `SettingsPage.tsx`：设置内部标签入口和面板编排。
- `SearchEnginePanel.tsx`：Bing、Google、Baidu 和自定义 HTTPS 搜索模板设置；错误在面板文档流内反馈。
- `LearningOverviewPanel.tsx`、`PlatformDistributionSummary.tsx`：学习概览展示。
- `CodeforcesSyncPanel.tsx`：Codeforces 提交同步和 rating 同步入口。
- `BackupPanel.tsx`：SQLite 数据库备份、学习数据 JSON 导出、导入预览和确认导入入口。
- `RealtimeSubmissionPanel.tsx`：实时提交监测诊断展示。
- `SiteManagementPanel.tsx`：站点配置列表、启停、删除、导入导出和新增站点编排。
- `CredentialsPage.tsx`：平台登录态摘要、脱敏保存凭据列表、重命名/删除、打开登录页更新密码、Codeforces Handle 绑定与 rating 同步；页面没有密码输入或查看能力。
- `AddSiteForm.tsx`：新增站点表单。
- `ImportPreviewPanel.tsx`：站点导入预览和冲突选择。
- `settingsApi.ts` 集中封装设置页 preload 调用。
- `settingsTypes.ts`、`siteManagementTypes.ts` 收敛设置页展示类型。

## 3. API 封装

`settingsApi.ts` 当前对外封装：

- 概览和诊断：`loadSettingsOverviewStats()`、`loadRealtimeSubmissionStatus()`。
- 地址栏搜索：`loadSearchEngine()`、`saveSearchEngine()`。
- Codeforces：`loadPrimaryCodeforcesAccount()`、`syncCodeforcesSubmissions()`、`syncCodeforcesRatingProfile()`。
- 备份导入导出：`createDatabaseBackup()`、`exportLearningData()`、`previewLearningDataImport()`、`confirmLearningDataImport()`。
- 站点配置：`loadSites()`、`toggleSiteEnabled()`、`deleteSiteConfig()`、`loadSiteById()`、`createSiteFromDraft()`。
- 账户管理：`loadCredentialSummaries()`、`renameCredential()`、`deleteSavedCredential()`、`openCredentialLoginPage()`。
- 导入导出：`exportSitesConfig()`、`importSitesConfig()`、`confirmImportSites()`。

## 4. 边界规则

- 新标签固定进入内部 home；设置页不再持有默认远程首页配置。
- 自定义搜索模板必须使用 HTTPS 且只含一个 `{query}` 占位符；renderer 提前反馈，最终配置始终以主进程校验后的返回值为准。
- 提交同步和 rating 同步的业务逻辑在主进程，renderer 只展示结果。
- 实时提交诊断只显示状态和最近事件，不写入调试数据。
- 备份导入导出只通过 preload 白名单调用主进程；renderer 不读取文件内容或本机数据库。
- 站点配置导入必须经过预览和确认，不能在 renderer 直接拼 SQL 或写文件。
- 新增设置项时优先扩展 `settingsApi.ts` 和对应类型文件。
- 账户页只消费脱敏摘要和 Cookie/rating 安全摘要；更新密码通过新建 OJ web 标签完成，不在内部页承接登录表单。

## 5. 验证入口

```powershell
cd algo-electron
node node_modules\typescript\bin\tsc --noEmit
npm run test:ui
```

涉及配置写入时启动 `npm run dev`，手测站点启停、导入导出、Codeforces 同步和实时诊断刷新。
