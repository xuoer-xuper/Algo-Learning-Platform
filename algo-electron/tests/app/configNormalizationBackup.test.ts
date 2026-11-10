import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createConfigNormalizationBackup,
  readConfigNormalizationSource,
  writeNormalizedConfigWithBackup,
} from '../../src/main/services/backup/lib/config-normalization-backup'

const harness = vi.hoisted(() => ({
  userDataDir: '',
  writeFailure: false,
  parseFailure: false,
  failReadNumber: 0,
  reads: 0,
  writes: 0,
  warnings: vi.fn(),
}))

vi.mock('electron', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, app: { getPath: () => harness.userDataDir } }
})

vi.mock('../../electron/shared/logger', () => ({
  logger: { scope: () => ({ warn: harness.warnings }) },
}))

vi.mock('electron-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('electron-store')>()
  class HarnessStore extends actual.default {
    constructor(options: ConstructorParameters<typeof actual.default>[0]) {
      super(options)
      if (harness.parseFailure) {
        throw new SyntaxError('Unexpected token near synthetic-private-config-sentinel')
      }
    }

    override get store(): Record<string, unknown> {
      harness.reads += 1
      if (harness.reads === harness.failReadNumber) {
        throw new SyntaxError('Unexpected token near synthetic-private-config-sentinel')
      }
      return super.store
    }

    override set store(value: Record<string, unknown>) {
      harness.writes += 1
      if (harness.writeFailure) {
        throw Object.assign(new Error('Disk full near synthetic-private-config-sentinel'), {
          code: 'ENOSPC',
        })
      }
      super.store = value
    }
  }
  return { ...actual, default: HarnessStore }
})

let directory = ''
let configPath = ''
let backupDir = ''

// Synthetic bytes, deliberately not canonical; the envelope is never decrypted.
const original = Buffer.from(
  '\uFEFF{\r\n\t"defaultHomeUrl": "https://example.test/practice",\r\n' +
    '\t"coach": {"enabled": false, "llm": {"encrypted_api_key": "synthetic-private-config-sentinel"}}\r\n}\r\n',
)

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-config-protection-'))
  harness.userDataDir = path.join(directory, 'profile')
  fs.mkdirSync(harness.userDataDir)
  configPath = path.join(harness.userDataDir, 'config.json')
  backupDir = path.join(harness.userDataDir, 'config-normalization-backups')
  harness.writeFailure = false
  harness.parseFailure = false
  harness.failReadNumber = 0
  harness.reads = 0
  harness.writes = 0
  harness.warnings.mockClear()
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  const resolved = path.resolve(directory)
  expect(
    resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}algo-config-protection-`),
  ).toBe(true)
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3 })
})

function completedBackups(): string[] {
  return fs.existsSync(backupDir)
    ? fs.readdirSync(backupDir).filter((name) => name.endsWith('.json'))
    : []
}

function expectSafeWarnings(): void {
  expect(harness.warnings).toHaveBeenCalled()
  const diagnostics = JSON.stringify(harness.warnings.mock.calls)
  expect(diagnostics).not.toContain('synthetic-private-config-sentinel')
  expect(diagnostics).not.toContain(configPath)
  expect(diagnostics).not.toContain('Unexpected token')
}

describe('config normalization protection', () => {
  it('should reopen an exact original-byte backup before normalization and preserve the encrypted envelope', async () => {
    fs.writeFileSync(configPath, original)
    const module = await import('../../electron/app/config')
    const loaded = module.loadConfig()
    expect(loaded.homeShortcuts).toEqual(['https://example.test/practice'])
    expect(loaded.coach.llm?.encrypted_api_key).toBe('synthetic-private-config-sentinel')
    expect(completedBackups()).toHaveLength(1)
    const backupPath = path.join(backupDir, completedBackups()[0])
    expect(fs.readFileSync(backupPath)).toEqual(original)
    expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).coach.llm.encrypted_api_key).toBe(
      'synthetic-private-config-sentinel',
    )
    expect(module.getCoachConfigForRenderer().llm).not.toHaveProperty('encrypted_api_key')
    expect(harness.warnings).not.toHaveBeenCalled()
    if (process.platform !== 'win32') {
      expect(fs.statSync(backupDir).mode & 0o077).toBe(0)
      expect(fs.statSync(backupPath).mode & 0o077).toBe(0)
    }

    const normalized = fs.readFileSync(configPath)
    vi.resetModules()
    const reopened = await import('../../electron/app/config')
    reopened.loadConfig()
    expect(fs.readFileSync(configPath)).toEqual(normalized)
    expect(completedBackups()).toHaveLength(1)
  })

  it('should remove a legacy-only key even when every other field is already canonical', async () => {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(import.meta.dirname, 'fixtures/rc1-config.json'), 'utf8'),
    )
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ...fixture,
        homeShortcuts: ['https://example.test/'],
        defaultHomeUrl: 'https://example.test/',
      }),
    )
    const before = fs.readFileSync(configPath)
    const { loadConfig } = await import('../../electron/app/config')
    loadConfig()
    expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).not.toHaveProperty('defaultHomeUrl')
    expect(fs.readFileSync(path.join(backupDir, completedBackups()[0]))).toEqual(before)
  })

  it('should skip backup and writes for canonical files, corrupt JSON and missing config', async () => {
    const canonical = fs.readFileSync(path.join(import.meta.dirname, 'fixtures/rc1-config.json'))
    for (const bytes of [
      canonical,
      Buffer.from('{"private":"synthetic-private-config-sentinel"'),
      null,
    ]) {
      if (bytes === null) fs.unlinkSync(configPath)
      else fs.writeFileSync(configPath, bytes)
      vi.resetModules()
      const { loadConfig } = await import('../../electron/app/config')
      loadConfig()
      expect(fs.existsSync(backupDir)).toBe(false)
      expect(harness.writes).toBe(0)
      if (bytes !== null) expect(fs.readFileSync(configPath)).toEqual(bytes)
      else expect(fs.existsSync(configPath)).toBe(false)
    }
    expectSafeWarnings()
  })

  it.each(['constructor', 'read'] as const)(
    'should not log parser fragments from a failed store %s',
    async (location) => {
      fs.writeFileSync(configPath, original)
      harness.parseFailure = location === 'constructor'
      harness.failReadNumber = location === 'read' ? 1 : 0
      const { loadConfig } = await import('../../electron/app/config')
      expect(loadConfig().homeShortcuts).toEqual([])
      expect(fs.readFileSync(configPath)).toEqual(original)
      expect(completedBackups()).toHaveLength(0)
      expect(harness.writes).toBe(0)
      expectSafeWarnings()
    },
  )

  it.each(['ENOSPC', 'EACCES', 'EPERM'] as const)(
    'should retain memory defaults and original bytes when backup creation fails with %s',
    async (code) => {
      fs.writeFileSync(configPath, original)
      const realOpen = fs.openSync
      vi.spyOn(fs, 'openSync').mockImplementation((file, flags, mode) => {
        if (typeof file === 'string' && file.endsWith('.partial')) {
          throw Object.assign(new Error('synthetic-private-config-sentinel'), { code })
        }
        return realOpen(file, flags, mode)
      })
      const { loadConfig } = await import('../../electron/app/config')
      expect(loadConfig().homeShortcuts).toEqual(['https://example.test/practice'])
      expect(fs.readFileSync(configPath)).toEqual(original)
      expect(harness.writes).toBe(0)
      expect(completedBackups()).toHaveLength(0)
      expectSafeWarnings()
      expect(harness.warnings.mock.calls[0][1]).toEqual({ reason: code })
    },
  )

  it('should leave partial bytes ineligible and the source untouched on a backup flush failure', async () => {
    fs.writeFileSync(configPath, original)
    vi.spyOn(fs, 'fsyncSync').mockImplementation(() => {
      throw Object.assign(new Error('synthetic-private-config-sentinel'), { code: 'ENOSPC' })
    })
    const { loadConfig } = await import('../../electron/app/config')
    loadConfig()
    expect(fs.readFileSync(configPath)).toEqual(original)
    expect(harness.writes).toBe(0)
    expect(completedBackups()).toHaveLength(0)
    expect(fs.readdirSync(backupDir)).toHaveLength(1)
    expect(fs.readdirSync(backupDir)[0]).toMatch(/\.partial$/)
    expectSafeWarnings()
  })

  it.each(['read', 'write', 'flush'] as const)(
    'should retain the primary %s failure when closing its descriptor also fails',
    (operation) => {
      fs.writeFileSync(configPath, original)
      const primary = Object.assign(new Error('primary synthetic failure'), {
        code: operation === 'read' ? 'EIO' : 'ENOSPC',
      })
      const secondary = Object.assign(new Error('secondary synthetic close failure'), {
        code: 'EPERM',
      })
      let failedDescriptor: number | undefined
      const read = fs.readFileSync
      vi.spyOn(fs, 'readFileSync').mockImplementation((file, options) => {
        if (operation === 'read' && typeof file === 'number') {
          failedDescriptor = file
          throw primary
        }
        return read(file, options)
      })
      const write = fs.writeFileSync
      vi.spyOn(fs, 'writeFileSync').mockImplementation((file, bytes, options) => {
        if (operation === 'write' && typeof file === 'number') {
          failedDescriptor = file
          throw primary
        }
        write(file, bytes, options)
      })
      const sync = fs.fsyncSync
      vi.spyOn(fs, 'fsyncSync').mockImplementation((descriptor) => {
        if (operation === 'flush') {
          failedDescriptor = descriptor
          throw primary
        }
        sync(descriptor)
      })
      const close = fs.closeSync
      vi.spyOn(fs, 'closeSync').mockImplementation((descriptor) => {
        close(descriptor)
        if (descriptor === failedDescriptor) throw secondary
      })

      let caught: unknown
      try {
        createConfigNormalizationBackup(harness.userDataDir, original)
      } catch (error) {
        caught = error
      }
      vi.restoreAllMocks()
      expect(caught).toBeInstanceOf(Error)
      expect(caught).toMatchObject({
        code: primary.code,
        cause: primary,
        closeError: secondary,
      })
      expect(fs.readFileSync(configPath)).toEqual(original)
      expect(completedBackups()).toHaveLength(0)
    },
  )

  it.each(['flush', 'close', 'corrupt', 'promotion'] as const)(
    'should preserve config and its verified backup after a staged normalization %s failure',
    (failure) => {
      fs.writeFileSync(configPath, original)
      const backupPath = createConfigNormalizationBackup(harness.userDataDir, original)
      let stagedDescriptor: number | undefined
      let stagedPath: string | undefined
      const open = fs.openSync
      vi.spyOn(fs, 'openSync').mockImplementation((file, flags, mode) => {
        const descriptor = open(file, flags, mode)
        if (
          typeof file === 'string' &&
          path.basename(file).startsWith('.config-normalization-') &&
          flags === 'wx'
        ) {
          stagedDescriptor = descriptor
          stagedPath = file
        }
        return descriptor
      })
      const fault = Object.assign(new Error('synthetic stage failure'), { code: 'EIO' })
      const sync = fs.fsyncSync
      vi.spyOn(fs, 'fsyncSync').mockImplementation((descriptor) => {
        if (failure === 'flush' && descriptor === stagedDescriptor) throw fault
        sync(descriptor)
      })
      const close = fs.closeSync
      vi.spyOn(fs, 'closeSync').mockImplementation((descriptor) => {
        close(descriptor)
        if (descriptor !== stagedDescriptor) return
        stagedDescriptor = undefined
        if (failure === 'close') throw fault
        if (failure === 'corrupt' && stagedPath) fs.writeFileSync(stagedPath, 'damaged stage')
      })
      const rename = fs.renameSync
      vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
        if (failure === 'promotion' && target === configPath) throw fault
        rename(source, target)
      })

      expect(() =>
        writeNormalizedConfigWithBackup(harness.userDataDir, original, '{"homeShortcuts":[]}'),
      ).toThrow()
      vi.restoreAllMocks()
      expect(fs.readFileSync(configPath)).toEqual(original)
      expect(fs.readFileSync(backupPath)).toEqual(original)
      expect(completedBackups()).toHaveLength(1)
    },
  )

  it('should not normalize the source when backup promotion fails', async () => {
    fs.writeFileSync(configPath, original)
    const rename = fs.renameSync
    vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (typeof target === 'string' && path.dirname(target) === backupDir) {
        throw Object.assign(new Error('synthetic backup promotion failure'), { code: 'EPERM' })
      }
      rename(source, target)
    })
    const { loadConfig } = await import('../../electron/app/config')
    expect(loadConfig().homeShortcuts).toEqual(['https://example.test/practice'])
    expect(fs.readFileSync(configPath)).toEqual(original)
    expect(completedBackups()).toHaveLength(0)
    expect(fs.readdirSync(backupDir).every((name) => name.endsWith('.partial'))).toBe(true)
    expectSafeWarnings()
    expect(harness.warnings.mock.calls[0][1]).toEqual({ reason: 'EPERM' })
  })

  it('should reject corruption detected by reopening the written backup', async () => {
    fs.writeFileSync(configPath, original)
    const realClose = fs.closeSync
    vi.spyOn(fs, 'closeSync').mockImplementation((descriptor) => {
      realClose(descriptor)
      if (!fs.existsSync(backupDir)) return
      for (const name of fs.readdirSync(backupDir).filter((entry) => entry.endsWith('.partial'))) {
        // Avoid writeFileSync here: its close would recursively invoke this fault seam.
        const fd = fs.openSync(path.join(backupDir, name), 'w')
        fs.writeSync(fd, 'corrupt synthetic backup')
        realClose(fd)
      }
    })
    const { loadConfig } = await import('../../electron/app/config')
    loadConfig()
    expect(fs.readFileSync(configPath)).toEqual(original)
    expect(harness.writes).toBe(0)
    expect(completedBackups()).toHaveLength(0)
    expectSafeWarnings()
    expect(harness.warnings.mock.calls[0][1]).toEqual({ reason: 'CONFIG_BACKUP_MISMATCH' })
  })

  it('should retain the verified backup and original when normalization write fails without logging secrets', async () => {
    fs.writeFileSync(configPath, original)
    const rename = fs.renameSync
    const writeFault = vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (target === configPath) {
        throw Object.assign(new Error('Disk full near synthetic-private-config-sentinel'), {
          code: 'ENOSPC',
        })
      }
      rename(source, target)
    })
    const module = await import('../../electron/app/config')
    expect(module.loadConfig().coach.enabled).toBe(false)
    expect(fs.readFileSync(configPath)).toEqual(original)
    expect(completedBackups()).toHaveLength(1)
    expect(fs.readFileSync(path.join(backupDir, completedBackups()[0]))).toEqual(original)
    expectSafeWarnings()
    expect(harness.warnings.mock.calls[0][1]).toEqual({ reason: 'ENOSPC' })

    // Restart reuses a verified copy, never replaces it or creates repeated snapshots.
    writeFault.mockRestore()
    vi.resetModules()
    const reopened = await import('../../electron/app/config')
    reopened.loadConfig()
    expect(completedBackups()).toHaveLength(1)
    reopened.saveThemePreference('dark')
    expect(reopened.getThemePreference()).toBe('dark')
    expect(completedBackups()).toHaveLength(1)
    expect(fs.readFileSync(path.join(backupDir, completedBackups()[0]))).toEqual(original)
  })

  it('should not create backups for ordinary saves and should retain their failure contract', async () => {
    const module = await import('../../electron/app/config')
    module.saveThemePreference('dark')
    expect(module.getThemePreference()).toBe('dark')
    expect(fs.existsSync(backupDir)).toBe(false)
    const before = fs.readFileSync(configPath)
    harness.writeFailure = true
    expect(() => module.saveThemePreference('light')).toThrow('Disk full')
    expect(module.getThemePreference()).toBe('dark')
    expect(fs.readFileSync(configPath)).toEqual(before)
    expect(fs.existsSync(backupDir)).toBe(false)
  })

  it('should not overwrite the config when disk fills during the staged normalization write', async () => {
    fs.writeFileSync(configPath, original)
    let stagedDescriptor: number | undefined
    const open = fs.openSync
    vi.spyOn(fs, 'openSync').mockImplementation((file, flags, mode) => {
      const descriptor = open(file, flags, mode)
      if (typeof file === 'string' && path.basename(file).startsWith('.config-normalization-')) {
        stagedDescriptor = descriptor
      }
      return descriptor
    })
    const write = fs.writeFileSync
    vi.spyOn(fs, 'writeFileSync').mockImplementation((file, bytes, options) => {
      if (file === stagedDescriptor) {
        fs.writeSync(file, 'partial normalized bytes')
        throw Object.assign(new Error('synthetic-private-config-sentinel'), { code: 'ENOSPC' })
      }
      write(file, bytes, options)
    })
    const { loadConfig } = await import('../../electron/app/config')
    loadConfig()
    expect(fs.readFileSync(configPath)).toEqual(original)
    expect(completedBackups()).toHaveLength(1)
    expect(fs.readFileSync(path.join(backupDir, completedBackups()[0]))).toEqual(original)
    expectSafeWarnings()
  })

  it('should refuse an EXDEV replacement instead of falling back to an in-place write', async () => {
    fs.writeFileSync(configPath, original)
    const rename = fs.renameSync
    vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (target === configPath)
        throw Object.assign(new Error('cross-device failure'), { code: 'EXDEV' })
      rename(source, target)
    })
    const { loadConfig } = await import('../../electron/app/config')
    loadConfig()
    expect(fs.readFileSync(configPath)).toEqual(original)
    expect(completedBackups()).toHaveLength(1)
    expectSafeWarnings()
    expect(harness.warnings.mock.calls[0][1]).toEqual({ reason: 'EXDEV' })
  })

  it('should not overwrite an external edit made after protection but before replacement', async () => {
    fs.writeFileSync(configPath, original)
    const externalEdit = Buffer.from('{"appearance":{"theme":"dark"}}')
    const open = fs.openSync
    let hasChanged = false
    vi.spyOn(fs, 'openSync').mockImplementation((file, flags, mode) => {
      if (
        !hasChanged &&
        typeof file === 'string' &&
        path.basename(file).startsWith('.config-normalization-')
      ) {
        hasChanged = true
        fs.writeFileSync(configPath, externalEdit)
      }
      return open(file, flags, mode)
    })
    const { loadConfig } = await import('../../electron/app/config')
    loadConfig()
    expect(fs.readFileSync(configPath)).toEqual(externalEdit)
    expect(completedBackups()).toHaveLength(1)
    expect(fs.readFileSync(path.join(backupDir, completedBackups()[0]))).toEqual(original)
    expectSafeWarnings()
    expect(harness.warnings.mock.calls[0][1]).toEqual({ reason: 'CONFIG_SOURCE_CHANGED' })
  })

  it('should reject an unreadable completed backup before any source overwrite', async () => {
    fs.writeFileSync(configPath, original)
    const backupPath = createConfigNormalizationBackup(harness.userDataDir, original)
    const open = fs.openSync
    vi.spyOn(fs, 'openSync').mockImplementation((file, flags, mode) => {
      if (file === backupPath) throw Object.assign(new Error('blocked backup'), { code: 'EACCES' })
      return open(file, flags, mode)
    })
    const { loadConfig } = await import('../../electron/app/config')
    loadConfig()
    expect(fs.readFileSync(configPath)).toEqual(original)
    expectSafeWarnings()
    expect(harness.warnings.mock.calls[0][1]).toEqual({ reason: 'EACCES' })
  })

  it('should refuse a corrupted completed backup instead of overwriting it or the config', () => {
    fs.writeFileSync(configPath, original)
    const backup = createConfigNormalizationBackup(harness.userDataDir, original)
    fs.writeFileSync(backup, 'corrupt backup')
    expect(() => createConfigNormalizationBackup(harness.userDataDir, original)).toThrow()
    expect(fs.readFileSync(configPath)).toEqual(original)
    expect(fs.readFileSync(backup, 'utf8')).toBe('corrupt backup')
  })

  it('should refuse to normalize stale source bytes after an external edit', () => {
    fs.writeFileSync(configPath, original)
    const source = readConfigNormalizationSource(harness.userDataDir)
    expect(source).toEqual(original)
    const changed = Buffer.from('{"appearance":{"theme":"dark"}}')
    fs.writeFileSync(configPath, changed)
    expect(() => createConfigNormalizationBackup(harness.userDataDir, original)).toThrow()
    expect(fs.readFileSync(configPath)).toEqual(changed)
    expect(fs.existsSync(backupDir)).toBe(false)
  })

  it('should refuse external directory junctions for the source profile and backup destination', async () => {
    const external = path.join(directory, 'external')
    fs.mkdirSync(external)
    fs.writeFileSync(path.join(external, 'config.json'), original)
    const linkedProfile = path.join(directory, 'linked-profile')
    fs.symlinkSync(external, linkedProfile, 'junction')
    expect(() => readConfigNormalizationSource(linkedProfile)).toThrow()
    expect(() => createConfigNormalizationBackup(linkedProfile, original)).toThrow()

    fs.writeFileSync(configPath, original)
    fs.symlinkSync(external, backupDir, 'junction')
    const { loadConfig } = await import('../../electron/app/config')
    loadConfig()
    expect(fs.readFileSync(configPath)).toEqual(original)
    expect(fs.readdirSync(external)).toEqual(['config.json'])
    expect(harness.writes).toBe(0)
    expectSafeWarnings()
  })

  it('should refuse multiply-linked config and backup files without touching outside data', async () => {
    const external = path.join(directory, 'external.json')
    fs.writeFileSync(external, original)
    fs.linkSync(external, configPath)
    const { loadConfig } = await import('../../electron/app/config')
    loadConfig()
    expect(harness.writes).toBe(0)
    expect(fs.existsSync(backupDir)).toBe(false)
    expect(fs.readFileSync(external)).toEqual(original)
    fs.unlinkSync(configPath)
    fs.writeFileSync(configPath, original)
    fs.mkdirSync(backupDir, { mode: 0o700 })
    const digest = createHash('sha256').update(original).digest('hex')
    fs.linkSync(external, path.join(backupDir, `config-before-normalization-${digest}.json`))
    expect(() => createConfigNormalizationBackup(harness.userDataDir, original)).toThrow()
    expect(fs.readFileSync(external)).toEqual(original)
    expect(fs.readFileSync(configPath)).toEqual(original)
  })
})
