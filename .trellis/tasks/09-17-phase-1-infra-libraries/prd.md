# 阶段 1 基础设施换库

## Goal

用模板指定的库替换三个自研基础设施（校验、日志、配置），统一 IPC 返回形状，并修掉两个已确认的时间格式 bug。完成后阶段 2/3 的所有新代码都有标准积木可用。

## Requirements

### R1 zod 替换 `payloadSchema.ts`（D11，A1）
- 新增 `zod`；`src/shared/types/ipc/*.ts` 按域定义每个带参 channel 的输入 schema（`z.object({...}).strict()`，等价于现在的"多余字段拒绝"）。
- `electron/ipc/trustedSender.ts` 的 schema 元组参数改为接受 `z.ZodTypeAny[]`；`parseOrReject` 改调 `safeParse`，失败抛 `IpcPayloadError(path, issues[0].message)`（保留 fail-closed 语义，不返回 null）。
- 196 处组合子调用替换：`text()`→`z.string().min(1).max(200)`、`freeText()`→`z.string().max(n)`、`int()`→`z.number().int().min().max()`、`oneOf()`→`z.enum()`、`arrayOf()`→`z.array()`、`object()`→`z.object().strict()`、`optional/nullable` 同名、`localDate`→`z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`、`pattern`→`z.string().regex`、`decimal`→`z.number()`、`binary`→`z.instanceof(Uint8Array)`、`raw()`→`z.unknown()`（仍受 `RAW_IPC_SCHEMA_BUDGET = 4` 棘轮）。
- 上限来源注释保留（URL 4096、FQDN 253、标识符 200）。
- 删除 `payloadSchema.ts`；`check-architecture.mjs` 的 `countUnschemadIpc` 改为识别 zod schema。
- `coach:saveConfig` / `saveLlmConfig` 白名单语义不变（`strict()`）。

### R2 electron-log 替换自研 logger（D10，A2）
- 新增 `electron-log`；`electron/shared/logger.ts` 改为：`log.transports.file.maxSize = 2MB`、`archiveLogFn` 保留 3 份、`log.hooks.push(redactHook)`（迁移现有 `redactString` / `SENSITIVE_KEY_PATTERN` / URL 脱敏逻辑，约 40 行）、`log.transports.console.level = process.env.ALGO_ELECTRON_LOG_STDERR ? 'debug' : false`。
- 导出 `logger = log`；模块内用 `logger.scope('模块')`。102 处 `appLogger.x('模块.事件', data)` 改为 `logger.scope('模块').x('事件', data)`。
- 保留 `getLogFilePath()`（用于 TROUBLESHOOTING 与错误对话框）。
- 早期启动缓冲：electron-log 在 `app.ready` 前写文件的行为需验证；若丢日志，用 `log.transports.file.resolvePathFn` 提前定路径。
- `tests/shared/logger*.test.ts` 改为测试 hook 的脱敏行为。

### R3 electron-store 替换 `config.ts`（D13，A4）+ dev/prod 隔离（高-6）
- 新增 `electron-store`；`electron/app/config.ts` 的 `loadConfig/saveConfig` 改为 `new Store<AppConfig>({ name: 'config', schema })`，schema 由 zod `AppConfigSchema` 经 `zod-to-json-schema` 生成或手写 JSON Schema；`normalize*` 函数改为 zod `.default()` / `.catch()`。
- 配置文件路径与格式保持 `userData/config.json`，旧文件可直接读（electron-store 默认同名同位）。
- 新增 `electron/app/envSetup.ts`：`if (!app.isPackaged) app.setPath('userData', app.getPath('userData') + '-dev')`；`main.ts` 第一个 import（在 `applyStartupSmokeUserDataPath` 之前，且冒烟模式优先级更高）。
- `docs/OPERATIONS/TROUBLESHOOTING.md` 注明 dev 数据目录带 `-dev` 后缀。

### R4 返回形状统一（D8，中-2、中-3）
- `src/shared/types/common.ts`：`createOutputSchema<T>(data: T)` 生成 `z.discriminatedUnion('success', [{success:true, data}, {success:false, error:z.string(), code:z.string().optional()}])`。
- 35 处 `{ ok: … }`（`backup/`、`scripts/` 等 service 层）与 23 处 `{ success: … }` 统一为上述形状；渲染层消费点同步。
- 6 处 `errorMessage(error)` 直返（`registerSitesIpc.ts:176,198,212`、`registerRatingIpc.ts:70`、`backupService.ts` ×2）改为固定文案 + `code` + `logger.warn`。

### R5 时间格式 bug 止血（高-5）
- `coach/CoachFeedbackStore.ts:345-349 computeSince` 改用 `toBeijing()`（与 `created_at` 同格式）。
- `coach/CoachOrchestrator.ts:1344,1364,1372` `contest_start/end` 改 `toBeijing()`；migration 030 不在本阶段（阶段 2.5 统一转毫秒时一并处理已有 UTC 值）。
- 删除 `CoachEventBridge.ts:257 nowIsoLocal`、`rules/RuleEngine.ts:438 defaultNowIso`，改 import `shared/time`。

## Acceptance Criteria

- [ ] `package.json` 含 `zod`、`electron-log`、`electron-store`；不含 `payloadSchema.ts`、自研 `AppLogger` 类。
- [ ] `tests/ipc/*`、`tests/security/trustedSender.test.ts` 全绿；`countUnschemadIpc` 报 0 未声明；`raw()` 等价物 ≤ 4。
- [ ] 故意向 `stats:getTrends` 传 `'abc'` 被拒绝（invoke reject），日志含 `IpcPayloadError`。
- [ ] 日志文件中 `Bearer xxx` / `cookie=` 被脱敏（测试断言）；`logger.scope` 在 102 处调用中使用，`grep "appLogger\." electron` = 0。
- [ ] 开发模式 userData 路径以 `-dev` 结尾；打包版不变；冒烟模式仍用 `ALGO_ELECTRON_SMOKE_USER_DATA`。
- [ ] `grep -rn "{ ok:" electron src` = 0；所有 IPC 输出类型来自 `createOutputSchema`。
- [ ] `grep -rn "errorMessage(error)" electron/ipc` 直返 = 0。
- [ ] 东八区下 `computeSince` 单测：`since` 与 `created_at` 同格式，暖机窗口不再多 8 小时。
- [ ] `pnpm test:all` 全绿。

## Out of Scope

- Drizzle（阶段 3）；时间戳转毫秒（阶段 2.5）；channel 常量与 shared types 全量（阶段 2，本阶段只建 `src/shared/types/ipc/` 与 `common.ts`）。

## Notes

- 前置：阶段 0 完成（zod schema 依赖 `@shared` alias 与 typescript-eslint）。
- 四个 R 各一个 commit；R1 与 R2 可并行分支。
