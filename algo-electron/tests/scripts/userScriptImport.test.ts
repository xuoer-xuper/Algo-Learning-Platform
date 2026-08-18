import { test } from 'vitest'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  compareUserScriptVersions,
  createLocalCopyNamespace,
  createUserScriptIdentity,
  createWindowsSafeSlug,
  decideUserScriptImport,
  rewriteUserScriptNamespace,
  writeUserScriptImport,
} from '../../electron/scripts/userScriptImport'
import { parseScriptMetadata } from '../../electron/scripts/userScriptMetadata'

function scriptCode(options: { name?: string; namespace?: string; version?: string } = {}): string {
  const namespaceLine = options.namespace === undefined ? '' : `// @namespace   ${options.namespace}\n`
  const versionLine = options.version === undefined ? '' : `// @version     ${options.version}\n`
  return `// ==UserScript==\n// @name        ${options.name ?? 'Sample Helper'}\n${namespaceLine}${versionLine}// ==/UserScript==\nconsole.log('sample')\n`
}

test('compares common userscript versions without lexical numeric errors', () => {
  assert.strictEqual(compareUserScriptVersions('1.10', '1.9'), 'newer')
  assert.strictEqual(compareUserScriptVersions('1.0', '1.0.0'), 'same')
  assert.strictEqual(compareUserScriptVersions('1.0-beta', '1.0'), 'older')
  assert.strictEqual(compareUserScriptVersions('build 12', 'build 11'), 'unknown')
  assert.strictEqual(compareUserScriptVersions(undefined, '1.0'), 'unknown')
})

test('keeps exact namespace and name as a stable collision-free identity', () => {
  const identity = createUserScriptIdentity('https://example.com/a|b', 'Helper|One')
  assert.strictEqual(identity.key, '["https://example.com/a|b","Helper|One"]')
  assert.notStrictEqual(identity.key, createUserScriptIdentity('https://example.com/a', 'b|Helper|One').key)
  assert.notStrictEqual(identity.key, createUserScriptIdentity('https://example.com/a|b', 'helper|One').key)
})

test('creates readable Windows-safe slugs with bounded reserved-name handling', () => {
  assert.strictEqual(createWindowsSafeSlug('  Better: CF / Helper.  '), 'Better-CF-Helper')
  assert.strictEqual(createWindowsSafeSlug('CON'), 'CON-script')
  assert.strictEqual(createWindowsSafeSlug('NUL.txt'), 'NUL-script.txt')
  assert.strictEqual(createWindowsSafeSlug('...   '), 'script')
  assert.strictEqual(createWindowsSafeSlug('A very long helper name', 8), 'A-very-l')
  assert.throws(() => createWindowsSafeSlug('Helper', 0), RangeError)
})

test('decides exact identity updates and produces recognizable deterministic filenames', () => {
  const code = scriptCode({ namespace: 'https://example.com/scripts', version: '1.10' })
  const decision = decideUserScriptImport({
    code,
    sourceFileName: 'download.user.js',
    existingScripts: [{
      id: 'installed-id',
      namespace: 'https://example.com/scripts',
      identityName: 'Sample Helper',
      version: '1.9',
      filePath: 'old-file.user.js',
    }],
  })

  assert.strictEqual(decision.action, 'update')
  assert.strictEqual(decision.existing?.id, 'installed-id')
  assert.strictEqual(decision.versionComparison, 'newer')
  assert.strictEqual(decision.autoUpdateEnabled, true)
  assert.match(decision.fileName, /^Sample-Helper--[a-f0-9]{12}--[a-f0-9]{12}\.user\.js$/)
  assert.strictEqual(decision.fileName, decideUserScriptImport({ code, sourceFileName: 'other.js' }).fileName)

  const caseDifferent = decideUserScriptImport({
    code: scriptCode({ name: 'sample Helper', namespace: 'https://example.com/scripts' }),
    sourceFileName: 'download.user.js',
    existingScripts: [{
      id: 'installed-id',
      namespace: 'https://example.com/scripts',
      identityName: 'Sample Helper',
    }],
  })
  assert.strictEqual(caseDifferent.action, 'create')
})

test('rewrites or inserts local copy namespace while preserving a parseable metadata header', () => {
  const copyId = 'A0C57EC1-4F7D-4D30-973A-D21047D17EBC'
  const localNamespace = createLocalCopyNamespace(copyId)
  assert.strictEqual(localNamespace, 'local:a0c57ec1-4f7d-4d30-973a-d21047d17ebc')

  const replaced = rewriteUserScriptNamespace(
    scriptCode({ namespace: 'https://example.com/scripts' }),
    localNamespace,
  )
  assert.strictEqual(parseScriptMetadata(replaced).namespace, localNamespace)
  assert.ok(!replaced.includes('https://example.com/scripts'))

  const inserted = rewriteUserScriptNamespace(scriptCode(), localNamespace)
  assert.strictEqual(parseScriptMetadata(inserted).namespace, localNamespace)

  const duplicate = rewriteUserScriptNamespace(
    scriptCode({ namespace: 'first.namespace' }).replace(
      '// @namespace   first.namespace',
      '// @namespace   first.namespace\n// @namespace   second.namespace',
    ),
    localNamespace,
  )
  assert.strictEqual(parseScriptMetadata(duplicate).namespace, localNamespace)
  assert.strictEqual((duplicate.match(/@namespace/g) ?? []).length, 1)

  const generated = rewriteUserScriptNamespace('console.log("plain")\n', localNamespace)
  assert.strictEqual(parseScriptMetadata(generated).namespace, localNamespace)
  assert.ok(generated.endsWith('console.log("plain")\n'))
  assert.throws(() => createLocalCopyNamespace('not-a-uuid'), /valid UUID/)
  assert.throws(() => rewriteUserScriptNamespace(scriptCode(), 'bad\nnamespace'), /single-line/)
})

test('creates an independent disabled-auto-update-ready local copy decision', () => {
  const original = scriptCode({ namespace: 'https://example.com/scripts', version: '2.0' })
  const decision = decideUserScriptImport({
    code: original,
    sourceFileName: 'sample.user.js',
    mode: 'copy',
    localCopyId: 'a0c57ec1-4f7d-4d30-973a-d21047d17ebc',
    existingScripts: [{
      id: 'original-id',
      namespace: 'https://example.com/scripts',
      identityName: 'Sample Helper',
      version: '2.0',
    }],
  })

  assert.strictEqual(decision.action, 'create')
  assert.strictEqual(decision.isLocalCopy, true)
  assert.strictEqual(decision.autoUpdateEnabled, false)
  assert.strictEqual(decision.identity.namespace, 'local:a0c57ec1-4f7d-4d30-973a-d21047d17ebc')
  assert.strictEqual(decision.identity.identityName, 'Sample Helper')
  assert.strictEqual(parseScriptMetadata(decision.code).namespace, 'local:a0c57ec1-4f7d-4d30-973a-d21047d17ebc')
})

test('writes through an injected persistence callback and removes files when persistence fails', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'alp-userscript-import-'))
  try {
    const decision = decideUserScriptImport({
      code: scriptCode({ namespace: 'https://example.com/scripts' }),
      sourceFileName: 'sample.user.js',
    })
    let persistedPath = ''
    const result = await writeUserScriptImport(decision, {
      scriptsDirectory: directory,
      temporaryId: 'success',
      persist: (_plan, filePath) => {
        persistedPath = filePath
        return 'saved-id'
      },
    })

    assert.strictEqual(result, 'saved-id')
    assert.strictEqual(fs.readFileSync(persistedPath, 'utf8'), decision.code)
    assert.ok(!fs.existsSync(path.join(directory, `.${decision.fileName}.success.tmp`)))

    const failedDecision = decideUserScriptImport({
      code: `${decision.code}\n// changed`,
      sourceFileName: 'sample.user.js',
    })
    const failedPath = path.join(directory, failedDecision.fileName)
    await assert.rejects(
      writeUserScriptImport(failedDecision, {
        scriptsDirectory: directory,
        temporaryId: 'failure',
        persist: () => {
          throw new Error('repository failure')
        },
      }),
      /repository failure/,
    )
    assert.ok(!fs.existsSync(failedPath))
    assert.ok(!fs.existsSync(path.join(directory, `.${failedDecision.fileName}.failure.tmp`)))
  }
  finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('reuses an identical content-addressed file without deleting it on persistence failure', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'alp-userscript-reuse-'))
  try {
    const decision = decideUserScriptImport({ code: scriptCode(), sourceFileName: 'sample.user.js' })
    const destination = path.join(directory, decision.fileName)
    fs.writeFileSync(destination, decision.code, 'utf8')

    await assert.rejects(
      writeUserScriptImport(decision, {
        scriptsDirectory: directory,
        temporaryId: 'reuse',
        persist: () => Promise.reject(new Error('repository failure')),
      }),
      /repository failure/,
    )
    assert.strictEqual(fs.readFileSync(destination, 'utf8'), decision.code)
  }
  finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
