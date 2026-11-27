import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as connection from '../../electron/db/connection'
import { runMigrations } from '../../electron/db/migrate'
import { migration030 } from '../../electron/db/migrations/030_timestamps_to_unix_ms'
import * as client from '../../src/main/db/client'
import { toLocalDay } from '../../src/shared/time'

const packageRoot = fileURLToPath(new URL('../../', import.meta.url))
const acceptedBase = 'aacbff0c2c1afe9df4fa2bda5698450f0d76e608'
const migrationPath = 'electron/db/migrations/030_timestamps_to_unix_ms.ts'
const corePath = 'electron/db/repositories/stats/recompute-core.ts'
// These are accepted-base Git blob bytes, not hashes derived from HEAD at test time.
// .gitattributes requires LF on every platform; do not normalize before hashing.
const frozenHashes = {
  [corePath]: 'd816c3ee693563e3a84e5333396eac4ab83eefb042cd33118158be1ea78bc508',
  [migrationPath]: '0dd5967628e9074a0315933e6bf96f0efd404fe9463455e4c95d8a23b250c395',
  'src/shared/time.ts': '9ca11982850f6b13d082e60e34b1ed56aed4d7d0c28c68bdef756d32aa8435cf',
}
const expectedRuntimeGraph = {
  [migrationPath]: [
    '../../shared/legacyTimestamp',
    '../../shared/logger',
    '../../../src/shared/time',
    '../timestampColumns',
    '../legacy-ai-context',
    '../repositories/stats/recompute-core',
  ],
  [corePath]: ['../../../../src/shared/time'],
  'src/shared/time.ts': [],
  'electron/shared/legacyTimestamp.ts': [],
  'electron/shared/logger.ts': ['node:fs', 'node:path', 'electron', 'electron-log/main'],
  'electron/db/timestampColumns.ts': [],
  'electron/db/legacy-ai-context.ts': ['../shared/legacyTimestamp'],
}

function readSource(file: string): string {
  return readFileSync(path.join(packageRoot, file), 'utf8')
}

function runtimeImports(file: string, source: string): string[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const imports: string[] = []
  function add(specifier: ts.Node | undefined): void {
    if (!specifier || !ts.isStringLiteralLike(specifier)) {
      throw new Error(`Nonliteral runtime module dependency: ${file}`)
    }
    imports.push(specifier.text)
  }
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      if (!node.importClause?.isTypeOnly) add(node.moduleSpecifier)
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      if (!node.isTypeOnly) add(node.moduleSpecifier)
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (!node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)) {
        add(node.moduleReference.expression)
      }
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      add(node.arguments[0])
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return imports
}

function assertHistoricalRuntimeGraph(read = readSource): void {
  const graph: Record<string, string[]> = {}
  function visit(file: string): void {
    if (Object.hasOwn(graph, file)) return
    const imports = runtimeImports(file, read(file))
    graph[file] = imports
    for (const specifier of imports) {
      if (!specifier.startsWith('.')) continue
      const target = path.resolve(packageRoot, path.dirname(file), specifier)
      const relative = path.relative(packageRoot, target).split(path.sep).join('/')
      assert.ok(!relative.startsWith('../'), `Historical dependency escapes package: ${file}`)
      visit(relative.endsWith('.ts') ? relative : `${relative}.ts`)
    }
  }
  visit(migrationPath)
  assert.deepEqual(graph, expectedRuntimeGraph, 'Migration030 runtime dependency graph changed')
}

afterEach(() => {
  connection.closeDb()
  vi.restoreAllMocks()
})

describe(`historical recompute branch frozen at ${acceptedBase}`, () => {
  it.each(Object.entries(frozenHashes))(
    'keeps %s at its exact accepted path and bytes',
    (file, hash) => {
      const bytes = readFileSync(path.join(packageRoot, file))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash)
    },
  )

  it('keeps the migration execution graph and the core shared-time-only runtime edge', () => {
    assertHistoricalRuntimeGraph()
  })

  it('distinguishes erased type imports from static, forwarded and lazy runtime dependencies', () => {
    expect(
      runtimeImports(
        'syntax.ts',
        `import type Database from 'better-sqlite3'
         import type { Types } from './types'
         export type { Types } from './types'
         import type Legacy = require('./types')
         type Other = import('./types').Other
         // import './comment-only'
         const text = "require('./string-only')"
         import './side-effect'
         import { value, type Mixed } from './mixed'
         import { type RetainedImport } from './type-side-effect'
         export { forwarded } from './forwarded'
         export * from './barrel'
         export { type RetainedExport } from './type-export-side-effect'
         import legacy = require('./legacy')
         async function lazy() { return import('./lazy') }
         const required = require('./required')`,
      ),
    ).toEqual([
      './side-effect',
      './mixed',
      './type-side-effect',
      './forwarded',
      './barrel',
      './type-export-side-effect',
      './legacy',
      './lazy',
      './required',
    ])
    expect(() => runtimeImports('computed.ts', 'const value = import(moduleName)')).toThrow(
      'Nonliteral runtime module dependency: computed.ts',
    )
  })

  it.each([
    { file: corePath, dependency: '../../../../src/main/db/client' },
    { file: 'electron/db/legacy-ai-context.ts', dependency: '../../src/main/db/client' },
  ])(
    'rejects a forwarding dependency introduced through $file without changing disk files',
    ({ file, dependency }) => {
      expect(() =>
        assertHistoricalRuntimeGraph((current) =>
          current === file
            ? `${readSource(current)}\nexport { createDrizzleClient } from '${dependency}'`
            : readSource(current),
        ),
      ).toThrow('Migration030 runtime dependency graph changed')
    },
  )

  it('rebuilds through migration030 with only its explicit DB before global initialization', () => {
    expect(() => connection.getDb()).toThrow('Database not initialized')
    const getDb = vi.spyOn(connection, 'getDb')
    // The modern connection imports Drizzle already; only this execution branch is isolated.
    const orm = vi.spyOn(client, 'createDrizzleClient').mockImplementation(() => {
      throw new Error('Migration030 must not enter the runtime ORM route')
    })
    const now = 1795737600123
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const sqlite = new Database(':memory:')
    try {
      sqlite.pragma('foreign_keys = ON')
      sqlite.exec(readSource('tests/db/fixtures/rc1.schema.sql'))
      const instant = '1970-01-01T00:00:00Z'
      sqlite
        .prepare(
          `INSERT INTO problems
        (id, platform, platform_problem_id, canonical_url, status,
         first_seen_at, first_solved_at, created_at, updated_at)
        VALUES ('historical', 'codeforces', '1A', 'https://example.test/1A', 'solved', ?, ?, ?, ?)`,
        )
        .run(instant, instant, instant, instant)
      sqlite
        .prepare(
          `INSERT INTO problem_visits
        (id, problem_id, platform, url, entered_at, duration_seconds, active_seconds, created_at, updated_at)
        VALUES ('visit', 'historical', 'codeforces', 'https://example.test/1A', ?, 60, 45, ?, ?)`,
        )
        .run(instant, instant, instant)
      sqlite
        .prepare(
          `INSERT INTO submissions
        (id, problem_id, platform, platform_submission_id, verdict, submitted_at, created_at, updated_at)
        VALUES ('submission', 'historical', 'codeforces', 'submission-1', 'AC', ?, ?, ?)`,
        )
        .run(instant, instant, instant)

      runMigrations(sqlite, [migration030])

      expect(sqlite.prepare('SELECT * FROM user_daily_stats').all()).toStrictEqual([
        {
          local_day: toLocalDay(0),
          active_seconds: 45,
          duration_seconds: 60,
          visited_problem_count: 1,
          solved_problem_count: 1,
          submission_count: 1,
          ac_submission_count: 1,
          platform_distribution_json: '[{"platform":"codeforces","count":1}]',
          recomputed_at: now,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      ])
      expect(
        sqlite.prepare('SELECT name, applied_at FROM schema_migrations WHERE version=30').get(),
      ).toEqual({ name: 'timestamps_to_unix_ms', applied_at: now })
      expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
      expect(sqlite.pragma('foreign_key_check')).toEqual([])
      expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(sqlite.open).toBe(true)
      expect(sqlite.inTransaction).toBe(false)
      expect(getDb).not.toHaveBeenCalled()
      expect(orm).not.toHaveBeenCalled()
      expect(() => connection.getDb()).toThrow('Database not initialized')
    } finally {
      sqlite.close()
    }
  })
})
