import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'vitest'
import { extractApiMethods, readApiLiteralSource, readPreloadSource } from './preloadApiExtractor'

/**
 * 每一个暴露的 api 方法都必须有渲染层调用者（`window.api.<域>.<方法>`）。
 *
 * 这是 R3 删除 31 个"暴露而无消费者"方法（docs/DESIGN/QUALITY_HARDENING_PLAN.md §9）
 * 之后立起的守卫：暴露面从 176 收到 144 后回归零基线。此后再加方法必须带着调用点
 * 一起来——没有调用者的方法没有 schema 实测、没有形状验证，只是在主进程与渲染层
 * 之间开一条没人走也未经验证的门。主进程 handler 侧的配对由 ipcContracts.test.ts
 * 管；本文件只管"暴露即有人用"。
 *
 * 判定口径：grep 渲染层 `window.api.<域>.<方法>` 的直接引用。经 *Api.ts 薄封装的
 * 调用点出现在封装层（这正是 *Api.ts 的存在意义），所以引用数 ≥1 即算有消费者。
 * 消费点允许的位置由架构守卫（check-architecture.mjs 的 renderer 规则）管：
 * 只有 *Api.ts、src/hooks/ 与入口 src/main.tsx。
 */

const projectRoot = process.cwd()
const srcRoot = path.join(projectRoot, 'src')
const SOURCE_EXT = /\.(?:ts|tsx)$/

function walkFiles(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(entryPath, files)
    } else if (SOURCE_EXT.test(entry.name)) {
      files.push(entryPath)
    }
  }
  return files
}

test('every exposed api method has a renderer caller', () => {
  // 只切 api 字面量：整份源文件会把 `declare global` 里的 `api: typeof api` 认成方法。
  const methods = extractApiMethods(readApiLiteralSource(readPreloadSource()))
  assert.ok(methods.size > 100, `暴露面应有 100+ 个方法，实测 ${methods.size}`)

  /** 渲染层 `window.api.<域>.<方法>` 引用 → 引用文件列表。 */
  const callers = new Map<string, string[]>()
  for (const file of walkFiles(srcRoot)) {
    const rel = path.relative(projectRoot, file).split(path.sep).join('/')
    const text = fs.readFileSync(file, 'utf-8')
    for (const match of text.matchAll(
      /\bwindow\.api\.([a-z][A-Za-z0-9_]*)\.([a-zA-Z][A-Za-z0-9_]*)/g,
    )) {
      const key = `${match[1]}.${match[2]}`
      const known = callers.get(key) ?? []
      if (!known.includes(rel)) known.push(rel)
      callers.set(key, known)
    }
  }

  // One-release compatibility only: new readers use data.onChanged, not this old event.
  const deprecated = new Set(['problem.onUpdated'])
  assert.ok(methods.has('problem.onUpdated'), 'Remove compatibility exception with old API')
  const missing = [...methods.keys()].filter((key) => !callers.has(key) && !deprecated.has(key))
  assert.deepStrictEqual(
    missing,
    [],
    `以下 api 方法没有渲染层调用者（删掉它们，或先把调用点写出来再暴露）:\n` +
      missing.map((key) => `  - ${key}`).join('\n'),
  )

  // 反向体检：调用点引用的域必须是真实存在的域，防止 `window.api.problm.listRecent`
  // 这类拼写漂移在两把守卫之间溜过去（这里的正则会把它当新键记下，却不匹配任何方法）。
  const unknownDomains = [...callers.keys()]
    .map((key) => key.split('.')[0])
    .filter((domain) => ![...methods.keys()].some((key) => key.startsWith(`${domain}.`)))
  assert.deepStrictEqual(
    [...new Set(unknownDomains)],
    [],
    '渲染层引用了不存在的 api 域（拼写错误？）',
  )
})
