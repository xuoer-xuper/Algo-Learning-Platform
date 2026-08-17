import fs from 'node:fs'
import path from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface Logger {
  debug(message: string, ...data: unknown[]): void
  info(message: string, ...data: unknown[]): void
  warn(message: string, ...data: unknown[]): void
  error(message: string, ...data: unknown[]): void
  fatal(message: string, ...data: unknown[]): void
  getLogFilePath(): string | null
}

interface ConsoleSink {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

export interface AppLoggerOptions {
  fileName?: string
  maxFileBytes?: number
  maxArchives?: number
  maxPendingEntries?: number
  maxEntryCharacters?: number
  now?: () => Date
  consoleSink?: ConsoleSink
  mirrorToConsole?: boolean
}

const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024
const DEFAULT_MAX_ARCHIVES = 3
const DEFAULT_MAX_PENDING_ENTRIES = 100
const DEFAULT_MAX_ENTRY_CHARACTERS = 64 * 1024
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
    .replace(/\b(password|passwd|secret|token|api[_-]?key|csrf)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
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
    return redactString(serialized ?? String(value))
  } catch {
    return redactString(String(value))
  }
}

function consoleMethod(level: LogLevel): keyof ConsoleSink {
  if (level === 'fatal') return 'error'
  return level
}

export class AppLogger implements Logger {
  private readonly fileName: string
  private readonly maxFileBytes: number
  private readonly maxArchives: number
  private readonly maxPendingEntries: number
  private readonly maxEntryCharacters: number
  private readonly now: () => Date
  private readonly consoleSink: ConsoleSink
  private readonly mirrorToConsole: boolean
  private readonly pendingEntries: string[] = []
  private filePath: string | null = null

  constructor(options: AppLoggerOptions = {}) {
    this.fileName = options.fileName ?? 'main.log'
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
    this.maxArchives = options.maxArchives ?? DEFAULT_MAX_ARCHIVES
    this.maxPendingEntries = options.maxPendingEntries ?? DEFAULT_MAX_PENDING_ENTRIES
    this.maxEntryCharacters = options.maxEntryCharacters ?? DEFAULT_MAX_ENTRY_CHARACTERS
    this.now = options.now ?? (() => new Date())
    this.consoleSink = options.consoleSink ?? console
    this.mirrorToConsole = options.mirrorToConsole ?? process.env.ALGO_ELECTRON_LOG_STDERR === '1'
  }

  initialize(logDirectory: string): void {
    try {
      fs.mkdirSync(logDirectory, { recursive: true })
      this.filePath = path.join(logDirectory, this.fileName)
      for (const entry of this.pendingEntries.splice(0)) this.append(entry)
    } catch (error) {
      this.filePath = null
      this.writeConsole('error', '[logger] failed to initialize file logging', error)
    }
  }

  debug(message: string, ...data: unknown[]): void { this.write('debug', message, data) }
  info(message: string, ...data: unknown[]): void { this.write('info', message, data) }
  warn(message: string, ...data: unknown[]): void { this.write('warn', message, data) }
  error(message: string, ...data: unknown[]): void { this.write('error', message, data) }
  fatal(message: string, ...data: unknown[]): void { this.write('fatal', message, data) }

  getLogFilePath(): string | null {
    return this.filePath
  }

  private write(level: LogLevel, message: string, data: unknown[]): void {
    const serialized = data.map(serializeValue).filter(Boolean)
    const suffix = serialized.length > 0 ? ` ${serialized.join(' ')}` : ''
    const rawEntry = `${this.now().toISOString()} [${level.toUpperCase()}] ${redactString(message)}${suffix}`
    const entry = `${rawEntry.slice(0, this.maxEntryCharacters)}\n`

    this.writeConsole(level, redactString(message), ...data.map(serializeValue))
    if (this.filePath) {
      this.append(entry)
      return
    }

    this.pendingEntries.push(entry)
    if (this.pendingEntries.length > this.maxPendingEntries) this.pendingEntries.shift()
  }

  private append(entry: string): void {
    if (!this.filePath) return
    try {
      this.rotateIfNeeded(Buffer.byteLength(entry))
      fs.appendFileSync(this.filePath, entry, 'utf8')
    } catch (error) {
      this.writeConsole('error', '[logger] failed to write log entry', error)
    }
  }

  private rotateIfNeeded(incomingBytes: number): void {
    if (!this.filePath || !fs.existsSync(this.filePath)) return
    if (fs.statSync(this.filePath).size + incomingBytes <= this.maxFileBytes) return

    if (this.maxArchives === 0) {
      fs.rmSync(this.filePath, { force: true })
      return
    }

    for (let index = this.maxArchives; index >= 1; index -= 1) {
      const source = index === 1 ? this.filePath : `${this.filePath}.${index - 1}`
      const target = `${this.filePath}.${index}`
      if (fs.existsSync(target)) fs.rmSync(target, { force: true })
      if (fs.existsSync(source)) fs.renameSync(source, target)
    }
  }

  private writeConsole(level: LogLevel, ...args: unknown[]): void {
    if (!this.mirrorToConsole) return
    try {
      this.consoleSink[consoleMethod(level)](...args)
    } catch {
      // Logging must never become a second application failure.
    }
  }
}

export const appLogger = new AppLogger()

export function initializeAppLogger(logDirectory: string): void {
  appLogger.initialize(logDirectory)
}
