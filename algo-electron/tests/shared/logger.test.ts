import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import { getLogFilePath, logger } from '../../electron/shared/logger.ts'

// electron-log 的文件 transport 由模块内配置；测试只重定向路径到临时目录，
// 其余（脱敏 hook、轮转、格式）全部走生产配置。electron 在 Vitest 下是
// tests/electron/electronMock.ts 的替身，路径求值不触发真实 userData。
const defaultResolvePathFn = logger.transports.file.resolvePathFn
const defaultMaxSize = logger.transports.file.maxSize

function useTempLogFile(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alp-logger-'))
  logger.transports.file.resolvePathFn = () => path.join(root, 'main.log')
  return root
}

function readLog(root: string): string {
  return fs.readFileSync(path.join(root, 'main.log'), 'utf8')
}

test('hook 脱敏：URL 查询/锚点、敏感键、Bearer/Basic、password=、cookie= 不落盘', () => {
  const root = useTempLogFile()
  try {
    logger.info('startup https://example.com/path?token=visible#fragment', {
      password: 'plain-password',
      nested: { apiKey: 'plain-key' },
      authorization: 'Bearer plain-token',
      // 假值刻意短于 tests/security 的 Cookie 头扫描阈值；断言只看它是否被遮蔽。
      cookie: 'leaked',
    })
    logger.warn('header Basic dXNlcjpwYXNz, body password=plain-pass, cookie=leaked-value')

    const output = readLog(root)
    // 时间戳保持自研实现的 UTC ISO 形态，级别大写。
    assert.match(output, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\] startup /)
    // URL 主干保留，查询串与锚点剥离。
    assert.ok(output.includes('https://example.com/path'))
    assert.ok(!output.includes('?token=visible'))
    assert.ok(!output.includes('#fragment'))
    // 对象键（含嵌套）命中 SENSITIVE_KEY_PATTERN 后值整体替换。
    assert.ok(!output.includes('plain-password'))
    assert.ok(!output.includes('plain-key'))
    assert.ok(!output.includes('plain-token'))
    assert.ok(!output.includes('leaked'))
    // 字符串体内的凭据形态逐个替换。
    assert.ok(!output.includes('dXNlcjpwYXNz'))
    assert.ok(!output.includes('plain-pass'))
    assert.ok(!output.includes('leaked-value'))
    assert.ok(output.includes('Basic [redacted]'))
    assert.ok(output.includes('password=[redacted]'))
    assert.ok(output.includes('cookie=[redacted]'))
    assert.ok(output.includes('[redacted]'))
    assert.strictEqual(getLogFilePath(), path.join(root, 'main.log'))
  } finally {
    logger.transports.file.resolvePathFn = defaultResolvePathFn
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('logger 序列化 Error、循环引用与空值时不抛错且信息可读', () => {
  const root = useTempLogFile()
  try {
    const circular: Record<string, unknown> = { label: 'value' }
    circular.self = circular

    assert.doesNotThrow(() =>
      logger.error('failure', new Error('broken'), circular, undefined, null),
    )
    const output = readLog(root)
    assert.ok(output.includes('Error: broken'))
    assert.ok(output.includes('[circular]'))
    assert.ok(output.includes('undefined'))
    assert.ok(output.includes('null'))
  } finally {
    logger.transports.file.resolvePathFn = defaultResolvePathFn
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('scope 标签还原为点分事件名，根 logger 事件名保持原样', () => {
  const root = useTempLogFile()
  try {
    logger.scope('probe').info('scoped-event', { ok: true })
    logger.info('plain-event')

    const output = readLog(root)
    assert.ok(output.includes('probe.scoped-event'))
    assert.ok(output.includes('[INFO] plain-event'))
    assert.ok(!output.includes('.plain-event'))
  } finally {
    logger.transports.file.resolvePathFn = defaultResolvePathFn
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('超过 maxSize 轮转时恰好保留 3 份归档', () => {
  const root = useTempLogFile()
  logger.transports.file.maxSize = 220
  try {
    for (let index = 0; index < 8; index += 1) {
      logger.warn(`rotation-entry-${index}`, { detail: 'x'.repeat(80) })
    }

    const files = fs.readdirSync(root).sort()
    assert.deepStrictEqual(files, ['main.log', 'main.log.1', 'main.log.2', 'main.log.3'])
    assert.strictEqual(getLogFilePath(), path.join(root, 'main.log'))
  } finally {
    logger.transports.file.maxSize = defaultMaxSize
    logger.transports.file.resolvePathFn = defaultResolvePathFn
    fs.rmSync(root, { recursive: true, force: true })
  }
})
