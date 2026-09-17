# 阶段 1 技术设计

## 1. 校验层：zod 接入 `trustedSender`

### 现状契约
```ts
// electron/ipc/trustedSender.ts（现）
handleFromShell(channel, [text(), int({ max: 3650 })], (event, id, days) => …)
// schema 元组同时推导 handler 参数类型
```

### 目标契约
```ts
// src/shared/types/ipc/stats.ts
export const getTrendsInput = [z.string().min(1).max(200), z.number().int().min(1).max(3650)] as const
// electron/ipc/trustedSender.ts
type Infer<S extends readonly z.ZodTypeAny[]> = { [K in keyof S]: z.infer<S[K]> }
export function handleFromShell<S extends readonly z.ZodTypeAny[]>(
  channel: string, schemas: S, handler: (event, ...args: Infer<S>) => unknown): void
```
- `parseOrReject`：对每个位置 `schemas[i].safeParse(args[i])`；失败 `throw new IpcPayloadError(`arg${i}.${issue.path.join('.')}`, issue.message, undefined)`。`describe(received)` 逻辑保留（不打印字符串内容）。
- 多余参数：`args.length > schemas.length` 仍拒绝。
- `raw()` 等价：`z.unknown()`；架构守卫改为统计 `z.unknown()` 出现在 schema 元组中的次数，预算 4。

### 边界
- zod v4：`error.issues` 字段名不变；`z.object().strict()` 存在。若用 v4 的 `z.strictObject` 亦可。
- `binary`：`z.instanceof(Uint8Array)`；IPC 序列化后为 `Uint8Array`，已验证（现 `binary()` 也是这样判断）。

### 测试点
- `tests/ipc/payloadSchema.test.ts` 改名 `ipcSchemas.test.ts`：每类组合子 → zod 等价物的 Good/Bad 用例；`strict()` 拒绝多余字段；`coach:saveConfig` 白名单 6 项。

## 2. 日志：electron-log + 脱敏 hook

```ts
// electron/shared/logger.ts（目标）
import log from 'electron-log/main'
log.initialize()
log.transports.file.maxSize = 2 * 1024 * 1024
log.transports.file.archiveLogFn = keepThreeArchives   // 现 maxArchives=3 语义
log.transports.console.level = process.env.ALGO_ELECTRON_LOG_STDERR === '1' ? 'debug' : false
log.hooks.push((message) => { message.data = message.data.map(redact); return message })
export const logger = log
export function getLogFilePath(): string { return log.transports.file.getFile().path }
```
- `redact(value)`：迁移现 `serializeValue` 里的 `SENSITIVE_KEY_PATTERN` 键替换、`redactString`（Bearer/Basic、`password=`、URL query/hash）、循环引用保护。Error 对象保留 `name/message/stack`。
- 早期缓冲：electron-log 在 `initialize()` 后即可写文件（路径由 `app.getPath('logs')` 决定，`ready` 前可用）。用 `tests/electron/startupSmoke` 验证启动前 3 条日志落盘。
- 渲染进程：暂不接 `electron-log/renderer`（渲染层现无日志需求；`rendererErrors.ts` 走 IPC）。

### 调用点迁移规则
`appLogger.warn('browser.navigation-blocked', {...})` → `const log = logger.scope('browser')` + `log.warn('navigation-blocked', {...})`。scope 名 = 现点分前缀第一段。

## 3. 配置：electron-store

```ts
// electron/app/config.ts（目标）
const AppConfigSchema = z.object({
  homeShortcuts: z.array(z.string().url()).default([]),
  search: SearchEngineConfigSchema.catch(DEFAULT_SEARCH_ENGINE_CONFIG),
  appearance: AppearanceConfigSchema.catch(DEFAULT_APPEARANCE_CONFIG),
  zoomByOrigin: ZoomByOriginSchema.catch({}),
  coach: CoachConfigSchema.catch(DEFAULT_COACH_CONFIG),
})
const store = new Store<AppConfig>({ name: 'config', schema: zodToJsonSchema(AppConfigSchema).properties, clearInvalidConfig: false })
export function loadConfig(): AppConfig { return AppConfigSchema.parse(store.store) }
export function saveConfig(partial: Partial<AppConfig>): void { store.set(AppConfigSchema.parse({ ...store.store, ...partial })) }
```
- 现有 `normalizeSearchEngineConfig` 等 4 个 normalizer 变为 zod schema 的 `catch`/`transform`，函数删除；`isStored*` 守卫删除。
- `getCoachConfigForRenderer` 仍摘掉 `llm.encrypted_api_key`（红线）。
- 文件兼容：electron-store 读同一 `userData/config.json`；旧字段缺失由 `default/catch` 补齐。**必须**用 `tests/app/config.test.ts` 加载一份 rc.1 时期的真实 config 样本验证不丢字段。

### env-setup
```ts
// electron/app/envSetup.ts
import { app } from 'electron'
if (!app.isPackaged && !process.env.ALGO_ELECTRON_SMOKE_USER_DATA) app.setPath('userData', `${app.getPath('userData')}-dev`)
export {}
```
`main.ts` 首行 `import './app/envSetup'`。ESM hoisting：必须是独立模块（模板 `environment.md`）。

## 4. 返回形状

```ts
// src/shared/types/common.ts
export const createOutputSchema = <T extends z.ZodTypeAny>(data: T) => z.discriminatedUnion('success', [
  z.object({ success: z.literal(true), data }),
  z.object({ success: z.literal(false), error: z.string(), code: z.string().optional() }),
])
```
- 渲染层判断统一 `if (result.success === true)`（模板 `type-safety.md` 强调 `=== true`）。
- `code` 枚举放 `src/shared/constants/errorCodes.ts`：`VALIDATION`、`NOT_FOUND`、`CONFLICT`、`IO`、`EXTERNAL`、`FORBIDDEN`。

## 5. 时间止血
仅改三处调用为 `toBeijing(date)`；不改列类型。阶段 2.5 的 migration 030 需同时识别两种历史格式（`YYYY-MM-DDTHH:mm:ss.SSS` 与 `…Z`）转毫秒。

## 6. 兼容与回滚
- R1–R4 均不改数据库、不改配置文件格式 ⇒ 无数据迁移，`git revert` 即回滚。
- R3 的 userData `-dev` 只影响开发者本机；首次启动会看到空库，属预期，在 PR 描述与 TROUBLESHOOTING 说明。
