import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

/**
 * preload 暴露面（`src/preload/index.ts` 的 `const api = { … }`）的文本提取器，
 * ipcContracts 与 apiConsumers 两个契约测试共用。
 *
 * R3 起暴露面是域分组对象：域键 2 空格缩进（`browser: {`），方法键 4 空格缩进；
 * 方法体到下一个 4 空格键或 2 空格的域收尾为止。提取范围收到字面量内
 * （`contextBridge.exposeInMainWorld` 之前），subscribe() 助手与类型导入不会混进来。
 * `browserLayout: BROWSER_LAYOUT` 不是域对象（不以 `{` 开头），不会被认成域。
 */

const projectRoot = process.cwd()

export function readPreloadSource(): string {
  return fs.readFileSync(path.join(projectRoot, 'src', 'preload', 'index.ts'), 'utf-8')
}

export function readApiLiteralSource(source: string): string {
  const start = source.indexOf('const api = {')
  const end = source.indexOf("contextBridge.exposeInMainWorld('api', api)")
  assert.ok(start >= 0, 'preload must declare `const api = { … }`')
  assert.ok(end > start, 'preload must call exposeInMainWorld(api)')
  return source.slice(start, end)
}

/** 域分组 api 字面量的方法提取器：`域.方法` → 方法体文本。 */
export function extractApiMethods(source: string): Map<string, string> {
  const methods = new Map<string, string>()
  let domain = ''
  let current: { key: string; lines: string[] } | null = null

  const flush = (): void => {
    if (current && domain) methods.set(`${domain}.${current.key}`, current.lines.join('\n'))
    current = null
  }

  for (const line of source.split('\n')) {
    const domainMatch = /^ {2}([a-z][A-Za-z0-9_]*): \{$/.exec(line)
    const methodMatch = /^ {4}([a-zA-Z][A-Za-z0-9_]*): (.*)$/.exec(line)
    const domainEnd = /^ {2}\},?$/.test(line)

    if (domainMatch) {
      flush()
      domain = domainMatch[1]
    } else if (domainEnd) {
      flush()
    } else if (methodMatch) {
      flush()
      current = { key: methodMatch[1], lines: [methodMatch[2]] }
    } else if (current) {
      current.lines.push(line)
    }
  }
  flush()
  return methods
}
