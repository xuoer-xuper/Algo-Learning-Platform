import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// Standalone guest fixture code. Do not import application migrations or bootstrap code here.
const WORK = 'C:\\ReleaseTest'
const PROFILE = 'C:\\Users\\WDAGUtilityAccount\\AppData\\Roaming\\algo-electron'
const DATABASE = path.join(PROFILE, 'data', 'algo-learning.sqlite')
const CHECKPOINT = `${DATABASE}.migration-attempt.json`
const SEED = path.join(WORK, 'seed.json')
const LEGACY = path.join(WORK, 'legacy-config.json')
const NORMALIZED = path.join(WORK, 'normalized-config.json')
const STAMP = '2026-01-02T03:04:05.123Z'
const NEW_STAMP = Date.parse('2026-01-03T03:04:05.123Z')
const IDS = {
  problem: 'sandbox-install-problem',
  submission: 'sandbox-install-submission',
  note: 'sandbox-install-note',
  script: 'sandbox-install-script',
  site: 'sandbox-install-site',
  credential: 'sandbox-install-credential',
  resource: 'sandbox-install-resource',
  added: 'sandbox-after-upgrade-problem',
}
const NOTE_RELATIVE = `notes/${IDS.problem}/${IDS.note}.md`
const IMAGE_RELATIVE = `notes/${IDS.problem}/assets/${IDS.note}/synthetic.png`
const SCRIPT_RELATIVE = `userscripts/${IDS.script}.js`
const BODY = `Synthetic installer fixture.\n\n![synthetic](assets/${IDS.note}/synthetic.png)\n`
const SCRIPT = [
  '// ==UserScript==',
  '// @name Synthetic installer fixture',
  '// @namespace local:sandbox-install',
  '// @version 1.0.0',
  '// @match https://example.invalid/*',
  '// @grant none',
  '// ==/UserScript==',
  '// Disabled fixture; never executes or downloads.',
  '',
].join('\n')
const RAW_ENVELOPE = JSON.stringify({
  version: 1,
  provider: 'electron-safe-storage',
  ciphertextBase64: Buffer.from('synthetic-not-dpapi-ciphertext').toString('base64'),
})
const CONFIG_ENVELOPE = Buffer.from('synthetic-config-not-dpapi-ciphertext').toString('base64')
const RESOURCE = Buffer.from([0, 1, 2, 128, 254, 255])
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwajgAAAJaAXNuhChbAAAAAElFTkSuQmCC',
  'base64',
)

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function samePath(actual, expected) {
  return path.resolve(actual).toLowerCase() === path.resolve(expected).toLowerCase()
}

function assertLocalPath(file) {
  const absolute = path.resolve(file)
  assert.ok(
    [WORK, PROFILE].some(
      (root) =>
        samePath(absolute, root) || absolute.toLowerCase().startsWith(`${root.toLowerCase()}\\`),
    ),
    'Fixture path escaped the owned guest roots',
  )
  let component = absolute
  for (;;) {
    if (fs.existsSync(component)) {
      const stat = fs.lstatSync(component)
      assert.equal(stat.isSymbolicLink(), false, 'Fixture paths must not contain links')
      if (stat.isFile()) assert.equal(stat.nlink, 1, 'Fixture files must not be hard-linked')
      assert.ok(samePath(fs.realpathSync.native(component), component), 'Unexpected real path')
    }
    const parent = path.dirname(component)
    if (parent === component) break
    component = parent
  }
  return absolute
}

function read(file) {
  assertLocalPath(file)
  assert.equal(fs.statSync(file).isFile(), true, 'Expected a regular fixture file')
  return fs.readFileSync(file)
}

function json(file) {
  return JSON.parse(read(file).toString('utf8'))
}

function write(file, bytes, exclusive = true) {
  assertLocalPath(file)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, bytes, { flag: exclusive ? 'wx' : 'w' })
}

function writeJson(file, value, exclusive = true) {
  write(file, `${JSON.stringify(value, null, 2)}\n`, exclusive)
}

function withDatabase(file, writable, callback) {
  assertLocalPath(file)
  assert.equal(fs.statSync(file).isFile(), true, 'Database must already exist')
  const database = new DatabaseSync(file, { readOnly: !writable })
  try {
    database.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;')
    return callback(database)
  } finally {
    database.close()
  }
}

function ledger(database, ceiling) {
  const rows = database
    .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
    .all()
  assert.equal(rows.length, ceiling, 'Unexpected migration count')
  rows.forEach((row, index) => assert.equal(row.version, index + 1, 'Non-contiguous ledger'))
  assert.equal(
    rows.at(-1)?.name,
    ceiling === 29 ? 'site_credential_labels' : 'timestamps_to_unix_ms',
  )
  return rows.map((row) => ({ ...row }))
}

function integrity(database) {
  assert.deepEqual(database.prepare('PRAGMA integrity_check').all().map(Object.values), [['ok']])
  assert.equal(database.prepare('PRAGMA foreign_key_check').all().length, 0)
  return { integrity: 'ok', foreignKeyViolations: 0 }
}

function insert(database, table, record) {
  const names = Object.keys(record)
  assert.match(table, /^[a-z_]+$/)
  for (const name of names) assert.match(name, /^[a-z_]+$/)
  database
    .prepare(`INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`)
    .run(...Object.values(record))
}

function transaction(database, callback) {
  database.exec('BEGIN IMMEDIATE')
  try {
    callback()
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function initialConfig() {
  return {
    homeShortcuts: [],
    coach: {
      enabled: false,
      sound: false,
      bubbleFrequency: 'medium',
      position: null,
      scale: 1,
      opacity: 1,
      pinMode: 'follow',
      llm: { enabled: false, encrypted_api_key: CONFIG_ENVELOPE },
      disclaimer_dismissed: true,
    },
    search: { engine: 'bing', customTemplate: null },
    zoomByOrigin: {},
    appearance: { theme: 'system' },
  }
}

function seed() {
  const sourceLedger = withDatabase(DATABASE, true, (database) => {
    const history = ledger(database, 29)
    integrity(database)
    transaction(database, () => {
      insert(database, 'problems', {
        id: IDS.problem,
        platform: 'codeforces',
        platform_problem_id: 'sandbox-install-only',
        canonical_url: 'https://example.invalid/synthetic/problem',
        title: 'Synthetic installer problem',
        first_seen_at: STAMP,
        created_at: STAMP,
        updated_at: STAMP,
      })
      insert(database, 'submissions', {
        id: IDS.submission,
        problem_id: IDS.problem,
        platform: 'codeforces',
        platform_submission_id: 'sandbox-install-only',
        verdict: 'AC',
        language: 'C++17',
        submitted_at: STAMP,
        created_at: STAMP,
        updated_at: STAMP,
      })
      insert(database, 'notes', {
        id: IDS.note,
        problem_id: IDS.problem,
        title: 'Synthetic note with image',
        file_path: path.join(PROFILE, NOTE_RELATIVE),
        content: BODY,
        created_at: STAMP,
        updated_at: STAMP,
      })
      insert(database, 'user_scripts', {
        id: IDS.script,
        name: 'Synthetic installer fixture',
        identity_name: 'Synthetic installer fixture',
        namespace: 'local:sandbox-install',
        match_urls_json: '["https://example.invalid/*"]',
        code: SCRIPT,
        file_path: path.join(PROFILE, SCRIPT_RELATIVE),
        enabled: 0,
        auto_update_enabled: 0,
        created_at: STAMP,
        updated_at: STAMP,
      })
      insert(database, 'site_configs', {
        id: IDS.site,
        name: 'Synthetic offline fixture',
        domains_json: '["example.invalid"]',
        home_url: 'https://example.invalid',
        enabled: 0,
        created_at: STAMP,
        updated_at: STAMP,
      })
      insert(database, 'site_credentials', {
        id: IDS.credential,
        site_id: IDS.site,
        username: 'synthetic-only',
        secret_envelope: RAW_ENVELOPE,
        created_at: STAMP,
        updated_at: STAMP,
      })
      insert(database, 'user_script_resources', {
        id: IDS.resource,
        script_id: IDS.script,
        resource_kind: 'resource',
        resource_key: 'fixture',
        declaration_order: 0,
        source_url: 'https://example.invalid/synthetic.bin',
        content_blob: RESOURCE,
        created_at: STAMP,
        updated_at: STAMP,
      })
    })
    integrity(database)
    return history
  })
  write(path.join(PROFILE, NOTE_RELATIVE), `# Synthetic note with image\n\n${BODY}`)
  write(path.join(PROFILE, IMAGE_RELATIVE), PNG)
  write(path.join(PROFILE, SCRIPT_RELATIVE), SCRIPT)
  const evidence = {
    sourceLedger,
    timestamp: STAMP,
    milliseconds: Date.parse(STAMP),
    files: [NOTE_RELATIVE, IMAGE_RELATIVE, SCRIPT_RELATIVE].map((relative) => ({
      relative,
      sha256: hash(read(path.join(PROFILE, relative))),
    })),
    envelopeSha256: hash(RAW_ENVELOPE),
    resourceSha256: hash(RESOURCE),
    provenance: 'Synthetic rows inserted into schema created by the installed 2.0.0 application.',
  }
  writeJson(SEED, evidence)
  return verifyFixture(DATABASE, 29, false)
}

function verifyFixture(file, version, hasNewRow) {
  const expected = json(SEED)
  return withDatabase(file, false, (database) => {
    const history = ledger(database, version)
    assert.deepEqual(history.slice(0, 29), expected.sourceLedger)
    const checks = integrity(database)
    const expectedTime = version === 29 ? STAMP : Date.parse(STAMP)
    const selections = [
      ['problems', IDS.problem, ['first_seen_at', 'created_at', 'updated_at']],
      ['submissions', IDS.submission, ['submitted_at', 'created_at', 'updated_at']],
      ['notes', IDS.note, ['created_at', 'updated_at']],
      ['user_scripts', IDS.script, ['created_at', 'updated_at']],
      ['site_configs', IDS.site, ['created_at', 'updated_at']],
      ['site_credentials', IDS.credential, ['created_at', 'updated_at']],
      ['user_script_resources', IDS.resource, ['created_at', 'updated_at']],
    ]
    for (const [table, id, columns] of selections) {
      const row = database.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)
      assert.ok(row, `Missing synthetic ${table} row`)
      const schema = database.prepare(`PRAGMA table_info(${table})`).all()
      for (const column of columns) {
        assert.equal(row[column], expectedTime, `Unexpected ${table}.${column}`)
        assert.equal(
          schema.find((item) => item.name === column)?.type.toUpperCase(),
          version === 29 ? 'TEXT' : 'INTEGER',
        )
      }
    }
    const note = database.prepare('SELECT * FROM notes WHERE id = ?').get(IDS.note)
    assert.equal(note?.problem_id, IDS.problem)
    assert.equal(note?.file_path, path.join(PROFILE, NOTE_RELATIVE))
    assert.equal(note?.content, BODY)
    assert.equal(
      database.prepare('SELECT problem_id FROM submissions WHERE id = ?').get(IDS.submission)
        ?.problem_id,
      IDS.problem,
    )
    const problem = database.prepare('SELECT * FROM problems WHERE id = ?').get(IDS.problem)
    assert.equal(problem?.title, 'Synthetic installer problem')
    assert.equal(problem?.canonical_url, 'https://example.invalid/synthetic/problem')
    const submission = database
      .prepare('SELECT * FROM submissions WHERE id = ?')
      .get(IDS.submission)
    assert.equal(submission?.verdict, 'AC')
    assert.equal(submission?.language, 'C++17')
    const script = database.prepare('SELECT * FROM user_scripts WHERE id = ?').get(IDS.script)
    assert.equal(script?.code, SCRIPT)
    assert.equal(script?.file_path, path.join(PROFILE, SCRIPT_RELATIVE))
    assert.equal(script?.enabled, 0)
    assert.equal(script?.auto_update_enabled, 0)
    const credential = database
      .prepare(
        'SELECT site_id, username, secret_envelope, sync_excluded FROM site_credentials WHERE id = ?',
      )
      .get(IDS.credential)
    assert.equal(credential?.site_id, IDS.site)
    assert.equal(credential?.username, 'synthetic-only')
    assert.equal(credential?.sync_excluded, 1)
    assert.equal(credential?.secret_envelope, RAW_ENVELOPE)
    const resource = database
      .prepare('SELECT content_blob FROM user_script_resources WHERE id = ?')
      .get(IDS.resource)
    assert.deepEqual(Buffer.from(resource?.content_blob ?? []), RESOURCE)
    const added = database.prepare('SELECT * FROM problems WHERE id = ?').get(IDS.added)
    if (hasNewRow) {
      assert.equal(added?.title, 'Added after upgrade; must survive recovery and reinstall')
      assert.equal(added?.created_at, NEW_STAMP)
    } else assert.equal(added, undefined, 'Unexpected post-upgrade row')
    return {
      ...checks,
      schemaVersion: version,
      ledger: history,
      timestamp: expectedTime,
      newRowPresent: hasNewRow,
      envelopeSha256: hash(credential.secret_envelope),
      resourceSha256: hash(Buffer.from(resource.content_blob)),
    }
  })
}

function verifyFiles() {
  const expected = json(SEED)
  for (const file of expected.files)
    assert.equal(hash(read(path.join(PROFILE, file.relative))), file.sha256)
  assert.equal(
    read(path.join(PROFILE, NOTE_RELATIVE)).toString('utf8'),
    `# Synthetic note with image\n\n${BODY}`,
  )
  const imagePath = path.resolve(
    path.dirname(path.join(PROFILE, NOTE_RELATIVE)),
    `assets/${IDS.note}/synthetic.png`,
  )
  assert.equal(imagePath, path.join(PROFILE, IMAGE_RELATIVE))
  assert.deepEqual(read(imagePath), PNG)
  return expected.files
}

function stageLegacy() {
  const legacy = { defaultHomeUrl: 'https://example.invalid/synthetic-home', ...initialConfig() }
  const bytes = Buffer.from(`${JSON.stringify(legacy, null, 2).replace(/\n/g, '\r\n')}\r\n`)
  write(LEGACY, bytes)
  write(path.join(PROFILE, 'config.json'), bytes, false)
  assert.deepEqual(read(path.join(PROFILE, 'config.json')), bytes)
  return {
    sha256: hash(bytes),
    size: bytes.length,
    encryptedEnvelope: 'synthetic bytes; no decryption claim',
  }
}

function verifyConfig() {
  const original = read(LEGACY)
  const backup = path.join(
    PROFILE,
    'config-normalization-backups',
    `config-before-normalization-${hash(original)}.json`,
  )
  assert.deepEqual(read(backup), original, 'Config original backup differs')
  const normalized = json(path.join(PROFILE, 'config.json'))
  assert.equal(normalized.defaultHomeUrl, undefined)
  assert.deepEqual(normalized.homeShortcuts, ['https://example.invalid/synthetic-home'])
  assert.equal(normalized.coach.enabled, false)
  assert.equal(normalized.coach.llm.enabled, false)
  assert.equal(normalized.coach.llm.encrypted_api_key, CONFIG_ENVELOPE)
  if (fs.existsSync(NORMALIZED)) {
    assert.deepEqual(
      read(path.join(PROFILE, 'config.json')),
      read(NORMALIZED),
      'Normalized config changed after first upgrade',
    )
  }
  return {
    originalSha256: hash(original),
    backupSha256: hash(read(backup)),
    normalizedSha256: hash(read(path.join(PROFILE, 'config.json'))),
  }
}

function checkpoint() {
  const record = json(CHECKPOINT)
  assert.equal(record.formatVersion, 1)
  assert.match(record.attemptId, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/)
  assert.ok(samePath(record.databasePath, DATABASE))
  assert.ok(samePath(record.backupDirectory, path.join(PROFILE, 'backups')))
  assert.match(record.backupBasename, /^algo-learning-pre-migration-[A-Za-z0-9-]+\.sqlite$/)
  const backup = path.join(record.backupDirectory, record.backupBasename)
  assert.equal(hash(read(backup)), record.backupSha256)
  assert.deepEqual(record.source.ledger, json(SEED).sourceLedger)
  assert.deepEqual(record.targetLedger, [
    ...json(SEED).sourceLedger,
    { version: 30, name: 'timestamps_to_unix_ms' },
  ])
  const manifest = json(`${backup}.verified.json`)
  assert.equal(manifest.formatVersion, 1)
  assert.ok(samePath(manifest.databasePath, DATABASE))
  assert.equal(manifest.sha256, record.backupSha256)
  assert.deepEqual(manifest.source, record.source)
  const sourceSchemaHash = withDatabase(backup, false, (database) =>
    hash(
      JSON.stringify(
        database
          .prepare(
            "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
          )
          .all(),
      ),
    ),
  )
  assert.equal(
    sourceSchemaHash,
    record.source.schemaHash,
    'Source backup physical schema differs from the checkpoint',
  )
  return { record, backup }
}

function verifyCurrent(hasNewRow, allowedStates = ['completed']) {
  const result = verifyFixture(DATABASE, 30, hasNewRow)
  const { record, backup } = checkpoint()
  assert.ok(allowedStates.includes(record.state), `Unexpected checkpoint state: ${record.state}`)
  const backupResult = verifyFixture(backup, 29, false)
  return {
    ...result,
    files: verifyFiles(),
    config: verifyConfig(),
    checkpoint: {
      attemptId: record.attemptId,
      state: record.state,
      sha256: hash(read(CHECKPOINT)),
      backupSha256: record.backupSha256,
      backupSchemaVersion: backupResult.schemaVersion,
    },
  }
}

function addNewRow() {
  verifyCurrent(false)
  withDatabase(DATABASE, true, (database) =>
    transaction(database, () =>
      insert(database, 'problems', {
        id: IDS.added,
        platform: 'codeforces',
        platform_problem_id: 'sandbox-after-upgrade-only',
        canonical_url: 'https://example.invalid/synthetic/new',
        title: 'Added after upgrade; must survive recovery and reinstall',
        first_seen_at: NEW_STAMP,
        created_at: NEW_STAMP,
        updated_at: NEW_STAMP,
      }),
    ),
  )
  return verifyCurrent(true)
}

function simulateUnfinished() {
  verifyCurrent(true)
  const { record } = checkpoint()
  write(path.join(WORK, 'completed-checkpoint.json'), read(CHECKPOINT))
  const changed = { ...record, state: 'prepared' }
  const staged = `${CHECKPOINT}.sandbox-staging`
  writeJson(staged, changed)
  fs.renameSync(staged, assertLocalPath(CHECKPOINT))
  const actual = json(CHECKPOINT)
  assert.deepEqual({ ...actual, state: 'completed' }, record, 'Simulation changed more than state')
  return {
    attemptId: record.attemptId,
    state: actual.state,
    simulation:
      'Only completed -> prepared on the real installed upgrade checkpoint; no process-kill claim.',
  }
}

function verifyResolved() {
  const current = verifyCurrent(true, ['resolved-keep-current'])
  const { record } = checkpoint()
  const directory = path.join(PROFILE, 'backups', 'resolutions')
  const audit = json(path.join(directory, `${record.attemptId}.keep-current.json`))
  assert.equal(audit.state, 'verified')
  assert.equal(audit.resolution, 'keep-current')
  assert.equal(audit.attemptId, record.attemptId)
  assert.ok(samePath(audit.databasePath, DATABASE))
  assert.deepEqual(audit.source.ledger, record.targetLedger)
  assert.match(audit.backupBasename, /^[A-Za-z0-9._-]+\.sqlite$/)
  const protectedCurrent = path.join(directory, audit.backupBasename)
  assert.equal(hash(read(protectedCurrent)), audit.backupSha256)
  verifyFixture(protectedCurrent, 30, true)
  return {
    ...current,
    currentStateBackupSha256: audit.backupSha256,
    resolutionAuditState: audit.state,
  }
}

function assertGuest() {
  assert.equal(process.platform, 'win32', 'Windows guest required')
  assert.equal(os.userInfo().username, 'WDAGUtilityAccount', 'Refusing a non-Sandbox account')
  assert.ok(samePath(process.env.USERPROFILE ?? '', 'C:\\Users\\WDAGUtilityAccount'))
  assert.ok(samePath(process.env.APPDATA ?? '', path.dirname(PROFILE)))
  const owner = json(path.join(WORK, 'owner.json'))
  assert.equal(owner.kind, 'algo-nsis-synthetic-guest-v1')
  assert.equal(owner.username, 'WDAGUtilityAccount')
  assert.equal(owner.profile, PROFILE)
  assert.match(owner.runId, /^[0-9a-f-]{36}$/)
  for (const key of Object.keys(process.env)) {
    assert.equal(key.startsWith('ALGO_ELECTRON_SMOKE_'), false, 'No smoke-mode redirection allowed')
  }
}

const actions = {
  bootstrap: () => {
    assert.equal(fs.existsSync(PROFILE), false, 'Default guest profile must initially be absent')
    writeJson(path.join(PROFILE, 'config.json'), initialConfig())
    return { profile: PROFILE, coachAndLlmDisabled: true, syntheticEnvelopeOnly: true }
  },
  'assert-schema29': () =>
    withDatabase(DATABASE, false, (database) => ({
      ...integrity(database),
      ledger: ledger(database, 29),
    })),
  seed,
  'verify-baseline': () => ({ ...verifyFixture(DATABASE, 29, false), files: verifyFiles() }),
  'stage-legacy': stageLegacy,
  'verify-upgraded': () => {
    const result = verifyCurrent(false)
    write(NORMALIZED, read(path.join(PROFILE, 'config.json')))
    return result
  },
  'add-new-row': addNewRow,
  'verify-new-row': () => verifyCurrent(true),
  'simulate-unfinished': simulateUnfinished,
  'verify-blocked': () => verifyCurrent(true, ['prepared']),
  'verify-resolved': verifyResolved,
}

try {
  assertGuest()
  const [action, ...extra] = process.argv.slice(2)
  assert.equal(extra.length, 0, 'Profile/path overrides are forbidden')
  assert.ok(Object.hasOwn(actions, action ?? ''), 'Unknown fixture action')
  const result = actions[action]()
  process.stdout.write(`${JSON.stringify({ action, status: 'passed', ...result })}\n`)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
}
