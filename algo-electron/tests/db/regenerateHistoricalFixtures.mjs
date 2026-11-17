import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { build, stop, version as esbuildVersion } from 'esbuild'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const repoRoot = path.dirname(packageRoot)
const fixtureDir = path.join(packageRoot, 'tests', 'db', 'fixtures')
const ledgerTimestamp = '2000-01-01T00:00:00.000'
const releases = [
  { id: 'v1', tag: 'v1.0.0', commit: '0758b253766db648f47418e95116437762001261', version: 21 },
  {
    id: 'beta2',
    tag: 'v1.1.0-beta.2',
    commit: 'b27debfcac5a368da1a19113bd1a48dc87526b79',
    version: 24,
  },
  {
    id: 'rc1',
    tag: 'v2.0.0-rc.1',
    commit: '7d052efcf37903ff22ad0a72d3147e62b600e0b9',
    version: 29,
  },
]

function git(...args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  })
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function quote(value) {
  return `'${value.replaceAll("'", "''")}'`
}

async function reconstruct(release) {
  assert.equal(git('rev-parse', `${release.commit}^{commit}`).toString().trim(), release.commit)
  const tree = new Map(
    git('ls-tree', '-r', release.commit, '--', 'algo-electron')
      .toString('utf8')
      .trim()
      .split('\n')
      .map((line) => {
        const match = /^\d+ blob ([a-f0-9]{40})\t(.+)$/.exec(line)
        assert.ok(match, `Unexpected tree record: ${line}`)
        return [match[2], match[1]]
      }),
  )
  const sources = new Map()
  function readSource(file) {
    const blob = tree.get(file)
    assert.ok(blob, `Missing pinned historical source: ${file}`)
    const bytes = git('cat-file', 'blob', blob)
    sources.set(file, { path: file, gitBlob: blob, sha256: sha256(bytes) })
    return bytes.toString('utf8')
  }
  const migrationFiles = [...tree.keys()]
    .filter((file) => /^algo-electron\/electron\/db\/migrations\/\d{3}_[^/]+\.ts$/.test(file))
    .sort()
  assert.equal(migrationFiles.length, release.version)
  const entry = migrationFiles
    .map(
      (file, index) =>
        `export { migration${String(index + 1).padStart(3, '0')} } from ${JSON.stringify(file)}`,
    )
    .join('\n')
  const result = await build({
    stdin: { contents: entry, sourcefile: 'historical-fixture-entry.ts', loader: 'ts' },
    absWorkingDir: packageRoot,
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
    tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: false } },
    plugins: [
      {
        name: 'pinned-git-migrations',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) => {
            const base = args.path.startsWith('.')
              ? path.posix.normalize(path.posix.join(path.posix.dirname(args.importer), args.path))
              : args.path
            assert.ok(
              base.startsWith('algo-electron/electron/'),
              `Unexpected historical runtime import: ${args.path}`,
            )
            const resolved = [base, `${base}.ts`, `${base}/index.ts`].find((file) => tree.has(file))
            assert.ok(resolved, `Unresolved historical import: ${args.importer} -> ${args.path}`)
            return { path: resolved, namespace: 'historical-git' }
          })
          builder.onLoad({ filter: /.*/, namespace: 'historical-git' }, (args) => ({
            contents: readSource(args.path),
            loader: 'ts',
          }))
        },
      },
    ],
  })
  // Only migration modules and their pinned helper closure execute, never the old application.
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
  )
  const migrations = Object.values(module).sort((left, right) => left.version - right.version)
  assert.deepEqual(
    migrations.map(({ version }) => version),
    Array.from({ length: release.version }, (_, i) => i + 1),
  )
  const runner = readSource('algo-electron/electron/db/migrate.ts')
  const ledgerSql = /db\.exec\(`([\s\S]*?)`\)/.exec(runner)?.[1]
  assert.ok(ledgerSql?.includes('CREATE TABLE IF NOT EXISTS schema_migrations'))
  const packageVersion = JSON.parse(readSource('algo-electron/package.json')).version
  const db = new Database(':memory:')
  try {
    db.pragma('foreign_keys = ON')
    db.exec(ledgerSql)
    const insertLedger = db.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)')
    for (const migration of migrations) {
      db.transaction(() => {
        migration.up(db)
        insertLedger.run(migration.version, migration.name, ledgerTimestamp)
      })()
    }
    const schema = db
      .prepare(
        `SELECT type, name, sql FROM sqlite_master
      WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
      ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name`,
      )
      .all()
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'sqlite_sequence'").get()
        .count,
      0,
      'AUTOINCREMENT sequence state requires explicit fixture serialization',
    )
    for (const { type, name } of schema) {
      if (type === 'table' && name !== 'schema_migrations') {
        assert.equal(
          db.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get().count,
          0,
          `Historical seeded table ${name} requires explicit fixture serialization`,
        )
      }
    }
    const statements = schema.map(({ sql }) => `${sql.trim().replace(/;$/, '')};`)
    const ledger = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all()
    const sql = [
      '-- Generated from pinned historical migrations; no user database was used.',
      `-- ${release.tag} (${release.commit}), schema ${release.version}.`,
      '-- Migration ledger times are synthetic; data rows are seeded by the tests.',
      ...statements,
      ...ledger.map(
        ({ version, name }) =>
          `INSERT INTO schema_migrations (version, name, applied_at) VALUES (${version}, ${quote(name)}, ${quote(ledgerTimestamp)});`,
      ),
      '',
    ].join('\n\n')
    const roundtrip = new Database(':memory:')
    try {
      roundtrip.pragma('foreign_keys = ON')
      roundtrip.exec(sql)
      assert.deepEqual(
        roundtrip
          .prepare(
            `SELECT type, name, sql FROM sqlite_master
          WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
          ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name`,
          )
          .all(),
        schema,
      )
      assert.deepEqual(
        roundtrip.prepare('SELECT * FROM schema_migrations ORDER BY version').all(),
        db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(),
      )
      assert.deepEqual(roundtrip.pragma('foreign_key_check'), [])
      assert.equal(roundtrip.pragma('integrity_check', { simple: true }), 'ok')
    } finally {
      roundtrip.close()
    }
    return {
      sql,
      provenance: {
        ...release,
        packageVersion,
        schemaFile: `${release.id}.schema.sql`,
        schemaSha256: sha256(sql),
        schemaObjects: schema.map(({ type, name }) => ({ type, name })),
        migrations: ledger,
        sources: [...sources.values()].sort((left, right) =>
          left.path.localeCompare(right.path, 'en'),
        ),
      },
      sqliteVersion: db.prepare('SELECT sqlite_version() AS version').get().version,
    }
  } finally {
    db.close()
  }
}

const snapshots = []
for (const release of releases) snapshots.push(await reconstruct(release))
fs.mkdirSync(fixtureDir, { recursive: true })
for (const snapshot of snapshots) {
  fs.writeFileSync(path.join(fixtureDir, snapshot.provenance.schemaFile), snapshot.sql, 'utf8')
}
const manifest = {
  formatVersion: 1,
  kind: 'historical-schema-reconstruction-with-synthetic-test-data',
  generation: {
    node: process.version,
    sqlite: snapshots[0].sqliteVersion,
    betterSqlite3: JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'node_modules/better-sqlite3/package.json'), 'utf8'),
    ).version,
    esbuild: esbuildVersion,
    ledgerTimestamp,
    command: 'node tests/db/regenerateHistoricalFixtures.mjs',
    note: 'Current SQLite executes pinned historical migration sources; this does not reproduce an old installer runtime or private user data.',
  },
  releases: snapshots.map(({ provenance }) => provenance),
}
fs.writeFileSync(
  path.join(fixtureDir, 'provenance.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
)
console.log(
  `Rebuilt ${snapshots.length} historical text schemas in ${path.relative(packageRoot, fixtureDir)}`,
)
stop()
