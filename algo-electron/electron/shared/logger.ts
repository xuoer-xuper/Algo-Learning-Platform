import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import electronLog from 'electron-log/main'

/**
 * 主进程日志的依赖注入接缝。测试用替身实现它；生产环境由下方 `logger`
 * （electron-log 主实例，补齐 fatal 与 getLogFilePath 后）充当默认值。
 */
export interface Logger {
  debug(message: string, ...data: unknown[]): void
  info(message: string, ...data: unknown[]): void
  warn(message: string, ...data: unknown[]): void
  error(message: string, ...data: unknown[]): void
  fatal(message: string, ...data: unknown[]): void
  getLogFilePath(): string | null
}

const LOG_DIRECTORY_NAME = 'logs'
const DEFAULT_FILE_NAME = 'main.log'
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_ARCHIVES = 3

const SENSITIVE_KEY_PATTERN = /authorization|cookie|csrf|password|passwd|secret|token|api[_-]?key/i
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi

function redactUrl(value: string): string {
  return value.replace(URL_PATTERN, (candidate) => {
    try {
      const url = new URL(candidate)
      url.username = ''
      url.password = ''
      url.search = ''
      url.hash = ''
      return url.toString()
    } catch {
      return candidate
    }
  })
}

function redactString(value: string): string {
  return redactUrl(value)
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\-/=]+/gi, '$1 [redacted]')
    .replace(
      /\b(password|passwd|secret|token|api[_-]?key|csrf|cookie)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[redacted]',
    )
}

function serializeValue(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return redactString(value)
  if (value instanceof Error) return redactString(value.stack || `${value.name}: ${value.message}`)

  const seen = new WeakSet<object>()
  try {
    const serialized = JSON.stringify(value, (key, nestedValue) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) return '[redacted]'
      if (typeof nestedValue === 'bigint') return nestedValue.toString()
      if (nestedValue instanceof Error) {
        return {
          name: nestedValue.name,
          message: nestedValue.message,
          stack: nestedValue.stack,
        }
      }
      if (nestedValue && typeof nestedValue === 'object') {
        if (seen.has(nestedValue)) return '[circular]'
        seen.add(nestedValue)
      }
      return nestedValue
    })
    // JSON.stringify 对函数/符号返回 undefined：直接落 String(value) 会得到函数源码或未定义文案，
    // 换成类型标记，日志里一眼能看出"这里不是数据"。
    return serialized === undefined ? `[${typeof value}]` : redactString(serialized)
  } catch {
    // 循环引用等不可序列化的值：退回对象默认描述（`[object Object]`），与原先 String(value) 等价。
    return redactString(Object.prototype.toString.call(value))
  }
}

/**
 * 脱敏 hook：在消息进入任何 transport 之前把全部参数序列化成字符串。
 * 循环引用、BigInt、Error（保留 name/message/stack）、敏感键（authorization/
 * cookie/csrf/password/secret/token/api_key）与字符串里的 Bearer/Basic、
 * `password=`、URL query/hash 都在这里处理，electron-log 自带的序列化器
 * 不再接触原始数据。
 */
function redactHook(message: Parameters<(typeof electronLog)['hooks'][number]>[0]) {
  message.data = message.data.map(serializeValue)
  return message
}

/**
 * scope 还原成自研时期的点分事件名：`logger.scope('browser').warn('x')`
 * 落盘为 `browser.x`，与迁移前点分事件名的日志行逐字节同形，TROUBLESHOOTING
 * 里按事件名 grep 的习惯不失效。根 logger（未 scope）的消息本就带完整点分名，
 * 前缀为空串。
 */
function prefixScope(scope: unknown): string {
  return typeof scope === 'string' && scope !== '' ? `${scope}.` : ''
}

function joinParts(parts: unknown[]): string {
  return parts.filter((part) => part !== '').join(' ')
}

/**
 * 文件行格式沿用自研实现：UTC ISO 时间戳 + 大写级别 + 点分事件 + JSON 载荷。
 * 自定义 format 函数绕开 electron-log 的 `{scope}` 模板（括号渲染 + 空格补齐）
 * 与本地时区日期变量。
 */
electronLog.transports.file.format = ({ data, level, message }) => [
  `${message.date.toISOString()} [${level.toUpperCase()}] ${prefixScope(message.scope)}${joinParts(data)}`,
]

electronLog.transports.console.format = ({ data, message }) => [
  `${prefixScope(message.scope)}${joinParts(data)}`,
]

// electron-log 默认把 fatal 之外的所有级别都映射到正确的 console 方法，但
// `consoleMethods['fatal']` 不存在会回落到 console.info（stdout）。自研实现里
// fatal 镜像到 stderr，这里保留原语义。
const CONSOLE_METHODS: Record<string, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
  fatal: console.error,
}

electronLog.transports.console.writeFn = ({ message }) => {
  const consoleMethod = CONSOLE_METHODS[message.level] ?? console.info
  consoleMethod(...message.data)
}

// 终端镜像开关沿用自研语义：只有 ALGO_ELECTRON_LOG_STDERR=1 时开启（debug 起）。
electronLog.transports.console.level =
  process.env.ALGO_ELECTRON_LOG_STDERR === '1' ? 'debug' : false

electronLog.transports.file.maxSize = MAX_FILE_BYTES

// electron-log 默认路径是 app.getPath('logs')（macOS 上不在 userData 内）。自研
// 实现固定写 userData/logs/main.log，这里保持不变。userData 必须从自己的 electron
// import 取：electron-log 是 node_modules 里的 CJS，vitest 下它 require('electron')
// 拿到的是二进制路径字符串而非测试替身，variables.userData 会落到真实 userData；
// 项目源文件的 electron import 才走 vitest alias，与 main.ts 里 applyStartupSmoke
// UserDataPath 的重定向同源。resolvePathFn 在每次写入时才求值，冒烟模式的重定向
// 因此对日志同样生效。
electronLog.transports.file.resolvePathFn = (variables) =>
  path.join(app.getPath('userData'), LOG_DIRECTORY_NAME, variables.fileName ?? DEFAULT_FILE_NAME)

/**
 * 轮转保留 3 份归档（main.log.1 最新 → main.log.3 最旧），命名与自研实现
 * 一致。Windows 上杀软短暂锁文件会让 rename/rm 抛错——捕获后放弃本条轮转，
 * 与旧 append() 的容错一致：日志失败绝不能变成第二个应用故障。
 */
electronLog.transports.file.archiveLogFn = (logFile) => {
  for (let index = MAX_ARCHIVES; index >= 1; index -= 1) {
    const source = index === 1 ? logFile.path : `${logFile.path}.${index - 1}`
    const target = `${logFile.path}.${index}`
    try {
      if (fs.existsSync(target)) fs.rmSync(target, { force: true })
      if (fs.existsSync(source)) fs.renameSync(source, target)
    } catch {
      // 静默降级：本条日志落入超限文件，下次轮转重试。
    }
  }
}

// 渲染进程不接 electron-log/renderer（rendererErrors 走自有 IPC 通道）。electron-log
// 在 dev 模式下默认开启 ipc transport，把主进程日志广播给所有窗口的 devtools——
// 没有渲染端消费者，显式关掉，避免每条日志一次跨进程广播。非 Electron 环境
// （vitest）下该 transport 本身就是 undefined，无需关闭。
if (electronLog.transports.ipc) electronLog.transports.ipc.level = false

// electron-log 无 fatal 级别；addLevel 把它插到最严重一档，文件行才能渲染 [FATAL]。
electronLog.addLevel('fatal', 0)

electronLog.hooks.push(redactHook)

export function getLogFilePath(): string | null {
  try {
    return electronLog.transports.file.getFile().path
  } catch {
    return null
  }
}

/**
 * electron-log 主实例补上 DI 接缝缺的两块后作为根 logger 导出：
 * - `fatal`：addLevel 已在运行时挂上，这里只是把类型补齐；
 * - `getLogFilePath`：致命错误对话框需要日志路径。
 * 模块内用 `logger.scope('域')` 取域日志器（scope = 点分事件名第一段）。
 */
export const logger = Object.assign(electronLog, { getLogFilePath }) as typeof electronLog &
  Pick<Logger, 'fatal' | 'getLogFilePath'>
