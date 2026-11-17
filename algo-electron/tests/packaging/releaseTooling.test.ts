import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createPackage } from '@electron/asar'
import { stringify } from 'yaml'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error Shared Node CLI guard module is intentionally runtime JavaScript.
import * as guards from '../../scripts/release-guards.mjs'
// @ts-expect-error Shared Node CLI workflow is intentionally runtime JavaScript.
import * as workflow from '../../scripts/release-workflow.mjs'
// @ts-expect-error Exercise the CLI parser with an injected runner, never real external commands.
import { main } from '../../scripts/release-cli.mjs'

const testRoot = path.resolve('tmp', 'release-tooling-tests')
const createdRoots: string[] = []
const master = 'a'.repeat(40)
const source = 'b'.repeat(40)
const target = 'c'.repeat(40)
const tagObject = 'd'.repeat(40)
const tag = 'v2.0.1'
const repo = 'xuoer-xuper/Algo-Learning-Platform'
const installerName = 'AlgoLearningPlatform-Windows-2.0.1-x64-Setup.exe'
const names = [installerName, `${installerName}.blockmap`, 'latest.yml']
const hash = (input: Buffer | string, algorithm = 'sha256', encoding: 'hex' | 'base64' = 'hex') =>
  createHash(algorithm).update(input).digest(encoding)
type RunOptions = { env?: Record<string, string>; logFile?: string }

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

afterEach(() => {
  for (const root of createdRoots.splice(0)) {
    expect(path.dirname(fs.realpathSync(root))).toBe(fs.realpathSync(testRoot))
    fs.rmSync(root, { recursive: true })
  }
})

async function fixture() {
  fs.mkdirSync(testRoot, { recursive: true })
  const directory = fs.mkdtempSync(path.join(testRoot, 'case-'))
  createdRoots.push(directory)
  const root = path.join(directory, 'algo-electron')
  const releaseDirectory = path.join(root, 'release', '2.0.1')
  const evidenceDirectory = path.join(root, 'tmp', 'release-acceptance')
  const changelogFile = path.join(directory, 'docs', 'PRODUCT', 'CHANGELOG.md')
  const notes = '## 2.0.1 - 2026-11-09\n\n### Fixes\n\n- Safe upgrades and verified recovery.'
  const changelog = `# Changelog\n\n${notes}\n\n## 2.0.0 - 2026-10-25\n\n- Published changes.\n`
  fs.mkdirSync(path.dirname(changelogFile), { recursive: true })
  fs.writeFileSync(changelogFile, changelog)
  const pkg = {
    name: 'algo-electron',
    private: true,
    version: '2.0.1',
    main: 'dist-electron/main.js',
  }
  writeJson(path.join(root, 'package.json'), pkg)
  fs.mkdirSync(evidenceDirectory, { recursive: true })
  const packageInput = path.join(directory, 'package-input')
  writeJson(path.join(packageInput, 'package.json'), pkg)
  const asar = path.join(releaseDirectory, 'win-unpacked', 'resources', 'app.asar')
  fs.mkdirSync(path.dirname(asar), { recursive: true })
  await createPackage(packageInput, asar)
  const installer = Buffer.from('synthetic NSIS executable, not executable code')
  fs.writeFileSync(path.join(releaseDirectory, installerName), installer)
  fs.writeFileSync(path.join(releaseDirectory, `${installerName}.blockmap`), 'synthetic blockmap')
  fs.writeFileSync(
    path.join(releaseDirectory, 'win-unpacked', 'AlgoLearningPlatform.exe'),
    'synthetic unpacked executable',
  )
  const metadata = {
    version: '2.0.1',
    files: [
      { url: installerName, sha512: hash(installer, 'sha512', 'base64'), size: installer.length },
    ],
    path: installerName,
    sha512: hash(installer, 'sha512', 'base64'),
    releaseDate: '2026-11-09T00:00:00.000Z',
  }
  fs.writeFileSync(path.join(releaseDirectory, 'latest.yml'), stringify(metadata))
  const identity = {
    version: '2.0.1',
    masterSha: master,
    sourceSha: source,
    targetSha: target,
    changelogSha256: hash(changelog),
  }
  const assets = names.map((name) => {
    const bytes = fs.readFileSync(path.join(releaseDirectory, name))
    return { name, size: bytes.length, sha256: hash(bytes) }
  })
  const build = {
    ...identity,
    formatVersion: 1,
    status: 'passed',
    commands: ['pnpm test:all', 'pnpm build:win'],
    logs: ['test-all.log', 'build-win.log'].map((name) => {
      const content = 'Synthetic build/test evidence only.'
      fs.writeFileSync(path.join(evidenceDirectory, name), content)
      return { name, size: Buffer.byteLength(content), sha256: hash(content) }
    }),
    assets,
    asarSha256: hash(fs.readFileSync(asar)),
  }
  writeJson(workflow.buildReportPath(root), build)
  const gates = Object.fromEntries(
    guards.ACCEPTANCE_GATES.map((name: string) => {
      const report = `${name}.md`
      const content = `Synthetic test evidence only. Source ${master}. Gate ${name}.`
      fs.writeFileSync(path.join(evidenceDirectory, report), content)
      return [name, { status: 'passed', sourceSha: master, report, sha256: hash(content) }]
    }),
  )
  const acceptance = {
    ...identity,
    formatVersion: 1,
    releasePr: 123,
    buildReportSha256: hash(fs.readFileSync(workflow.buildReportPath(root))),
    approvedBy: 'unit-test-author',
    publicationAuthorized: true,
    gates,
  }
  const acceptanceFile = path.join(evidenceDirectory, 'acceptance.json')
  writeJson(acceptanceFile, acceptance)
  const calls: { command: string; args: string[]; options?: RunOptions }[] = []
  const state = {
    dirty: '',
    branch: 'master',
    remoteMaster: master,
    parents: `${target} ${source}`,
    localTag: false,
    remoteTag: false,
    released: false,
    draft: true,
    fail: '',
    corruptDownload: false,
    missingRemoteAsset: false,
    exeVersion: '2.0.1',
    checksPass: true,
    wrongTagObject: false,
    latestBaseline: 'v2.0.0',
  }
  const release = () => ({
    id: 42,
    tag_name: tag,
    draft: state.draft,
    prerelease: false,
    target_commitish: master,
    body: notes,
  })
  const run = async (command: string, args: string[], options?: RunOptions): Promise<string> => {
    calls.push({ command, args, options })
    const key = `${command} ${args.join(' ')}`
    if (state.fail && key.includes(state.fail)) throw new Error('Synthetic external failure')
    if (command === 'git') {
      if (args[0] === 'status') return state.dirty
      if (args[0] === 'config') return 'algo-electron/.husky/_'
      if (args[0] === 'remote') return `https://github.com/${repo}.git`
      if (args[0] === 'branch') return state.branch
      if (args[0] === 'fetch') return ''
      if (args[0] === 'show') return state.parents
      if (args[0] === 'diff') return ''
      if (args[0] === 'cat-file') return 'tag'
      if (args[0] === 'rev-parse') {
        if (args[1] === '--abbrev-ref') return 'origin/master'
        if (args[1] === 'v2.0.0^{commit}') return guards.BASELINE.sha
        if (args[1] === `refs/tags/${tag}`) return tagObject
        return master
      }
      if (args[0] === 'for-each-ref') return state.localTag ? `refs/tags/${tag}` : ''
      if (args[0] === 'ls-remote') {
        if (args.includes('--heads')) return `${state.remoteMaster}\trefs/heads/master\n`
        if (args.includes('refs/tags/v2.0.0')) return `${guards.BASELINE.sha}\trefs/tags/v2.0.0\n`
        return state.remoteTag
          ? `${tagObject}\trefs/tags/${tag}\n${master}\trefs/tags/${tag}^{}\n`
          : ''
      }
      if (args[0] === 'push') {
        state.remoteTag = true
        return ''
      }
    }
    if (command === 'powershell.exe')
      return JSON.stringify({ file: state.exeVersion, product: state.exeVersion })
    if (command === 'node') {
      if (args.includes('.release-it.publish.json')) state.localTag = true
      return ''
    }
    if (command === 'gh') {
      if (args[0] === 'api') {
        if (args.includes('PATCH')) {
          state.draft = false
          return JSON.stringify(release())
        }
        const endpoint = args.at(-1) ?? ''
        if (endpoint === `repos/${repo}`)
          return JSON.stringify({ full_name: repo, permissions: { push: true } })
        if (endpoint.endsWith('/releases/latest'))
          return JSON.stringify({ tag_name: state.latestBaseline, draft: false, prerelease: false })
        if (endpoint.includes('/releases/tags/v2.0.0'))
          return JSON.stringify({ tag_name: 'v2.0.0', draft: false, prerelease: false })
        if (endpoint.includes('/releases?'))
          return JSON.stringify([state.released ? [release()] : []])
        if (endpoint.includes('/pulls/'))
          return JSON.stringify({
            merged: true,
            merge_commit_sha: master,
            head: { sha: source, ref: 'dev', repo: { full_name: repo } },
            base: { ref: 'master', repo: { full_name: repo } },
          })
        if (endpoint.includes('/check-runs')) {
          const head = endpoint.includes(source) ? source : master
          return JSON.stringify([
            {
              check_runs: guards.REQUIRED_CHECKS.map((name: string) => ({
                name,
                head_sha: head,
                app: { slug: 'github-actions' },
                status: 'completed',
                conclusion: state.checksPass ? 'success' : 'failure',
              })),
            },
          ])
        }
        if (endpoint.includes('/git/ref/tags/'))
          return JSON.stringify({
            object: { type: 'tag', sha: state.wrongTagObject ? 'e'.repeat(40) : tagObject },
          })
        if (endpoint.includes('/git/tags/'))
          return JSON.stringify({
            tag,
            object: { type: 'commit', sha: master },
            message: `${tag}\n`,
          })
        if (endpoint.includes('/assets?'))
          return JSON.stringify([
            assets
              .slice(state.missingRemoteAsset ? 1 : 0)
              .map((asset) => ({ ...asset, state: 'uploaded', digest: `sha256:${asset.sha256}` })),
          ])
      }
      if (args[0] === 'release' && args[1] === 'create') {
        state.released = true
        return ''
      }
      if (args[0] === 'release' && args[1] === 'download') {
        const dir = args[args.indexOf('--dir') + 1]
        for (const name of names)
          fs.copyFileSync(path.join(releaseDirectory, name), path.join(dir, name))
        if (state.corruptDownload)
          fs.writeFileSync(path.join(dir, installerName), Buffer.alloc(installer.length, 'x'))
        return ''
      }
    }
    throw new Error(`Unexpected fake command: ${key}`)
  }
  return {
    root,
    run,
    acceptanceFile,
    identity,
    acceptance,
    build,
    metadata,
    state,
    calls,
    releaseDirectory,
    evidenceDirectory,
    changelogFile,
    packageInput,
    asar,
    notes,
  }
}

function sourceSnapshot(f: Awaited<ReturnType<typeof fixture>>) {
  return [
    path.join(f.root, 'package.json'),
    f.changelogFile,
    f.asar,
    ...names.map((name) => path.join(f.releaseDirectory, name)),
  ].map((file) => hash(fs.readFileSync(file)))
}

describe('release tooling fail-closed preflight', () => {
  it('validates exact source, reviewed notes, package, installer metadata and all hashes without mutation', async () => {
    const f = await fixture()
    const before = sourceSnapshot(f)
    const result = await workflow.preflight(f)
    expect(result.acceptance.masterSha).toBe(master)
    expect(sourceSnapshot(f)).toEqual(before)
    expect(f.calls.some(({ command, args }) => command === 'git' && args[0] === 'fetch')).toBe(true)
    expect(
      f.calls.some(({ args }) => args.some((arg) => ['push', 'PATCH', 'create'].includes(arg))),
    ).toBe(false)
  })

  it.each(names)('rejects missing asset %s', async (name) => {
    const f = await fixture()
    fs.unlinkSync(path.join(f.releaseDirectory, name))
    await expect(workflow.preflight(f)).rejects.toThrow('exactly')
  })

  it.each(names)('rejects empty asset %s', async (name) => {
    const f = await fixture()
    fs.writeFileSync(path.join(f.releaseDirectory, name), '')
    await expect(workflow.preflight(f)).rejects.toThrow('empty')
  })

  it.each(['version', 'filename', 'size', 'sha512', 'duplicate-key', 'extra-file'])(
    'rejects latest.yml %s errors',
    async (kind) => {
      const f = await fixture()
      if (kind === 'version') f.metadata.version = '2.0.0'
      if (kind === 'filename') f.metadata.files[0].url = 'unexpected.exe'
      if (kind === 'size') f.metadata.files[0].size += 1
      if (kind === 'sha512') f.metadata.sha512 = 'invalid'
      if (kind === 'extra-file') f.metadata.files.push({ ...f.metadata.files[0] })
      fs.writeFileSync(
        path.join(f.releaseDirectory, 'latest.yml'),
        stringify(f.metadata) + (kind === 'duplicate-key' ? '\nversion: 2.0.1\n' : ''),
      )
      await expect(workflow.preflight(f)).rejects.toThrow(/latest.yml|Invalid/)
    },
  )

  it.each([
    'blockmap',
    'extra-asset',
    'exe-version',
    'source-package',
    'changelog',
    'asar-package',
  ])('rejects %s divergence', async (kind) => {
    const f = await fixture()
    if (kind === 'blockmap')
      fs.appendFileSync(path.join(f.releaseDirectory, `${installerName}.blockmap`), 'changed')
    if (kind === 'extra-asset') fs.writeFileSync(path.join(f.releaseDirectory, 'old.exe'), 'old')
    if (kind === 'exe-version') f.state.exeVersion = '2.0.0'
    if (kind === 'source-package')
      writeJson(path.join(f.root, 'package.json'), {
        name: 'algo-electron',
        private: true,
        version: '2.0.0',
      })
    if (kind === 'changelog') fs.appendFileSync(f.changelogFile, 'not reviewed')
    if (kind === 'asar-package') {
      writeJson(path.join(f.packageInput, 'package.json'), {
        name: 'algo-electron',
        version: '2.0.0',
      })
      await createPackage(f.packageInput, f.asar)
    }
    await expect(workflow.preflight(f)).rejects.toThrow()
  })

  it.each([
    'untracked',
    'tracked',
    'branch',
    'master',
    'parents',
    'local-tag',
    'remote-tag',
    'release',
    'ci',
  ])('rejects unsafe %s state before any side effects', async (kind) => {
    const f = await fixture()
    if (kind === 'untracked') f.state.dirty = '?? accidental.txt\n'
    if (kind === 'tracked') f.state.dirty = ' M algo-electron/package.json\n'
    if (kind === 'branch') f.state.branch = 'dev'
    if (kind === 'master') f.state.remoteMaster = 'e'.repeat(40)
    if (kind === 'parents') f.state.parents = `${source} ${target}`
    if (kind === 'local-tag') f.state.localTag = true
    if (kind === 'remote-tag') f.state.remoteTag = true
    if (kind === 'release') f.state.released = true
    if (kind === 'ci') f.state.checksPass = false
    const before = sourceSnapshot(f)
    await expect(workflow.draftRelease(f, `draft-${tag}@${master}`)).rejects.toThrow()
    expect(
      f.calls.some(
        ({ command, args }) => command === 'node' || args[0] === 'push' || args[1] === 'create',
      ),
    ).toBe(false)
    expect(sourceSnapshot(f)).toEqual(before)
  })

  it.each(['git fetch', 'git ls-remote', 'gh api repos/', 'releases?per_page=100', '/check-runs'])(
    'never treats remote failure %s as absence',
    async (failure) => {
      const f = await fixture()
      f.state.fail = failure
      await expect(workflow.draftRelease(f, `draft-${tag}@${master}`)).rejects.toThrow(
        'external failure',
      )
      expect(f.state.localTag).toBe(false)
      expect(f.state.released).toBe(false)
    },
  )

  it.each(['approval', 'report', 'source', 'build-report'])(
    'requires actual acceptance %s evidence, not dry-run status',
    async (kind) => {
      const f = await fixture()
      if (kind === 'approval') f.acceptance.publicationAuthorized = false
      if (kind === 'source') f.acceptance.gates.independentReview.sourceSha = source
      if (kind === 'report')
        fs.writeFileSync(path.join(f.evidenceDirectory, 'independentReview.md'), 'dry-run only')
      if (kind === 'build-report') f.acceptance.buildReportSha256 = '0'.repeat(64)
      writeJson(f.acceptanceFile, f.acceptance)
      await expect(workflow.preflight(f)).rejects.toThrow()
    },
  )
})

describe('release preparation and inert defaults', () => {
  it.each(['success', 'guard-failure', 'tag-failure'])(
    'installed release-it publication lifecycle preserves source on %s without rollback',
    async (scenario) => {
      // Installed release-it declarations omit its runtime default export.
      const releaseIt: unknown = await import('release-it')
      if (
        !releaseIt ||
        typeof releaseIt !== 'object' ||
        !('default' in releaseIt) ||
        typeof releaseIt.default !== 'function'
      )
        throw new Error('Missing release-it lifecycle entrypoint')
      const commands: string[] = []
      const packageBefore = fs.readFileSync('package.json')
      const notesBefore = fs.readFileSync('../docs/PRODUCT/CHANGELOG.md')
      const exitListeners = process.listeners('exit')
      const interruptListeners = process.listeners('SIGINT')
      const shell = {
        exec: async (command: string | string[]) => {
          const text = Array.isArray(command) ? command.join(' ') : command
          commands.push(text)
          if (text === 'node scripts/release-cli.mjs guard-tag') {
            if (
              scenario === 'guard-failure' &&
              commands.filter((item) => item === text).length === 2
            )
              throw new Error('Synthetic tag guard failure')
            return ''
          }
          if (text === 'git rev-parse --abbrev-ref HEAD') return 'master'
          if (text === 'git diff --quiet HEAD' || text === 'git fetch') return ''
          if (text === 'git config --get branch.master.remote') return 'origin'
          if (text === 'git remote get-url origin') return `https://github.com/${repo}.git`
          if (text === 'git describe --tags --match=v* --abbrev=0') return 'v2.0.0'
          if (text === 'git rev-list v2.0.0 --tags --max-count=1') return guards.BASELINE.sha
          if (text === `git describe --tags --abbrev=0 "${guards.BASELINE.sha}^"`)
            return 'v2.0.0-rc.1'
          if (text === 'git symbolic-ref HEAD') return 'refs/heads/master'
          if (text === 'git for-each-ref --format="%(upstream:short)" refs/heads/master')
            return 'origin/master'
          if (text === `git tag --annotate --message ${tag} ${tag}`) {
            if (scenario === 'tag-failure') throw new Error('Synthetic local tag failure')
            return ''
          }
          throw new Error(`Unexpected installed lifecycle command: ${text}`)
        },
      }
      const noop = () => undefined
      const result: Promise<unknown> = releaseIt.default(
        { config: '.release-it.publish.json', ci: true },
        {
          shell,
          spinner: {
            show: ({ enabled = true, task }: { enabled?: boolean; task: () => unknown }) =>
              enabled ? task() : undefined,
          },
          log: {
            log: noop,
            error: noop,
            info: noop,
            warn: noop,
            verbose: noop,
            exec: noop,
            obtrusive: noop,
            preview: noop,
          },
        },
      )
      if (scenario === 'success') await expect(result).resolves.toMatchObject({ version: '2.0.1' })
      else await expect(result).rejects.toThrow(/Synthetic/)
      expect(commands[0]).toBe('node scripts/release-cli.mjs guard-tag')
      expect(commands).toContain('git fetch')
      expect(commands.filter((command) => command.endsWith('guard-tag'))).toHaveLength(2)
      expect(commands.filter((command) => command.startsWith('git tag'))).toHaveLength(
        scenario === 'guard-failure' ? 0 : 1,
      )
      expect(
        commands.some((command) =>
          /^(?:npm |git (?:add|commit|push|reset|checkout)\b)/.test(command),
        ),
      ).toBe(false)
      expect(process.listeners('exit')).toEqual(exitListeners)
      expect(process.listeners('SIGINT')).toEqual(interruptListeners)
      expect(fs.readFileSync('package.json')).toEqual(packageBefore)
      expect(fs.readFileSync('../docs/PRODUCT/CHANGELOG.md')).toEqual(notesBefore)
    },
  )

  it('rejects stale published baseline rather than reusing v2.0.0 for a later release', async () => {
    const f = await fixture()
    f.state.branch = 'chore/release-preparation'
    f.state.latestBaseline = 'v2.0.2'
    await expect(workflow.prepareRelease({ ...f, version: '2.0.1' })).rejects.toThrow(
      'baseline is stale',
    )
    expect(f.calls.some(({ command }) => command === 'node')).toBe(false)
  })

  it('anchors prep to published v2.0.0 on a PR branch and never tags/pushes', async () => {
    const f = await fixture()
    f.state.branch = 'chore/release-preparation'
    const run = async (command: string, args: string[], options?: RunOptions) => {
      const result = await f.run(command, args, options)
      if (command === 'node')
        f.state.dirty = ' M algo-electron/package.json\0M  docs/PRODUCT/CHANGELOG.md\0'
      return result
    }
    await workflow.prepareRelease({ ...f, run, version: '2.0.1' })
    const invocation = f.calls.find(({ command }) => command === 'node')
    expect(invocation?.args).toContain('.release-it.prepare.json')
    expect(invocation?.options?.env?.RELEASE_PREPARE_VERSION).toBe('2.0.1')
    expect(f.calls.some(({ args }) => args[0] === 'push' || args[1] === 'create')).toBe(false)
  })

  it.each([
    '?? generated-source.ts\0',
    'M  algo-electron/electron/main.ts\0',
    ' M algo-electron/electron/main.ts\0',
    'A  algo-electron/package-lock.json\0',
    'R  algo-electron/package.json\0unexpected-source.json\0',
  ])('rejects unexpected preparation output %s without discarding it', async (status) => {
    const f = await fixture()
    f.state.branch = 'chore/release-preparation'
    const run = async (command: string, args: string[], options?: RunOptions) => {
      const result = await f.run(command, args, options)
      if (command === 'node') f.state.dirty = status
      return result
    }
    await expect(workflow.prepareRelease({ ...f, run, version: '2.0.1' })).rejects.toThrow(
      'Unexpected preparation changes',
    )
    expect(f.state.dirty).toBe(status)
    expect(f.calls.some(({ args }) => ['reset', 'checkout', 'push'].includes(args[0]))).toBe(false)
  })

  it.each(['stale', 'empty', 'duplicate'])('rejects %s generated release notes', async (kind) => {
    const f = await fixture()
    f.state.branch = 'chore/release-preparation'
    const run = async (command: string, args: string[], options?: RunOptions) => {
      const result = await f.run(command, args, options)
      if (command === 'node') {
        const notes =
          kind === 'stale'
            ? '## 2.0.0\n\nPrevious release.\n'
            : kind === 'empty'
              ? '## 2.0.1\n\n## 2.0.0\n\nPrevious release.\n'
              : '## 2.0.1\n\nNew notes.\n\n## 2.0.1\n\nDuplicate notes.\n'
        fs.writeFileSync(f.changelogFile, notes)
      }
      return result
    }
    await expect(workflow.prepareRelease({ ...f, run, version: '2.0.1' })).rejects.toThrow(
      /changelog version|notes/,
    )
    expect(f.calls.some(({ args }) => ['reset', 'checkout', 'push'].includes(args[0]))).toBe(false)
  })

  it.each(['master', 'dev', ''])('rejects prep on %s', async (branch) => {
    const f = await fixture()
    f.state.branch = branch
    await expect(workflow.prepareRelease({ ...f, version: '2.0.1' })).rejects.toThrow('PR branch')
    expect(f.calls.some(({ command }) => command === 'node')).toBe(false)
  })

  it('default release and --dry-run cannot produce acceptance or mutate source', async () => {
    const f = await fixture()
    await expect(main(['help'], { run: f.run, environment: {} })).rejects.toThrow(
      'not a one-command',
    )
    expect(f.calls).toHaveLength(0)
    await expect(main(['draft', '--dry-run'], { run: f.run, environment: {} })).rejects.toThrow(
      'dry-run',
    )
    await expect(main(['guard-tag'], { run: f.run, environment: {} })).rejects.toThrow(
      'guarded draft',
    )
    expect(f.state.localTag).toBe(false)
  })

  it('rejects hook bypass and demo build environment without logging secret values', () => {
    expect(() => workflow.assertSafeEnvironment({ HUSKY: '0' })).toThrow('HUSKY')
    expect(() =>
      workflow.assertSafeEnvironment({ ARK_DEMO_KEY: 'synthetic-private-value' }),
    ).toThrow('ARK_DEMO_KEY')
    try {
      workflow.assertSafeEnvironment({ ARK_DEMO_KEY: 'synthetic-private-value' })
    } catch (error) {
      expect(String(error)).not.toContain('synthetic-private-value')
    }
  })
})

describe('accepted source build evidence', () => {
  async function freshBuildFixture() {
    const f = await fixture()
    const root = path.join(path.dirname(f.root), 'fresh-build', 'algo-electron')
    const releaseDirectory = path.join(root, 'release', '2.0.1')
    fs.mkdirSync(root, { recursive: true })
    fs.copyFileSync(path.join(f.root, 'package.json'), path.join(root, 'package.json'))
    const changelogFile = path.join(root, '..', 'docs', 'PRODUCT', 'CHANGELOG.md')
    fs.mkdirSync(path.dirname(changelogFile), { recursive: true })
    fs.copyFileSync(f.changelogFile, changelogFile)
    const commands: string[] = []
    const buildRun = async (command: string, args: string[], options?: RunOptions) => {
      if (command !== 'pnpm') return f.run(command, args, options)
      commands.push(args[1])
      if (!options?.logFile) throw new Error('Expected build log capture')
      fs.writeFileSync(options.logFile, `Synthetic successful ${args[1]} only`)
      if (args[1] === 'build:win')
        fs.cpSync(f.releaseDirectory, releaseDirectory, { recursive: true })
      return ''
    }
    return { ...f, root, releaseDirectory, run: buildRun, commands }
  }

  it('does not reuse existing build output or claim it was built from current source', async () => {
    const f = await fixture()
    await expect(workflow.buildRelease(f)).rejects.toThrow('output already exists')
    expect(f.calls.some(({ command }) => command === 'pnpm')).toBe(false)
  })

  it('records source, both successful gates, asset and log hashes only after rechecking', async () => {
    const f = await freshBuildFixture()
    const report = await workflow.buildRelease(f)
    expect(f.commands).toEqual(['test:all', 'build:win'])
    expect(report.masterSha).toBe(master)
    expect(report.assets).toEqual(f.build.assets)
    expect(report.logs).toHaveLength(2)
    expect(JSON.parse(fs.readFileSync(workflow.buildReportPath(f.root), 'utf8')).status).toBe(
      'passed',
    )
  })

  it('failed gate and post-build source mutation cannot emit passed evidence', async () => {
    const f = await freshBuildFixture()
    const failRun = async (command: string, args: string[], options?: RunOptions) => {
      if (command === 'pnpm') throw new Error('Synthetic full gate failure')
      return f.run(command, args, options)
    }
    await expect(workflow.buildRelease({ ...f, run: failRun })).rejects.toThrow('gate failure')
    expect(fs.existsSync(workflow.buildReportPath(f.root))).toBe(false)
    const mutateRun = async (command: string, args: string[], options?: RunOptions) => {
      const result = await f.run(command, args, options)
      if (command === 'pnpm' && args[1] === 'build:win') f.state.dirty = '?? accidental-source.txt'
      return result
    }
    await expect(workflow.buildRelease({ ...f, run: mutateRun })).rejects.toThrow(
      'including untracked',
    )
    expect(fs.existsSync(workflow.buildReportPath(f.root))).toBe(false)
  })
})

describe('separate draft, download verification and explicit public release', () => {
  it('rejects dry-run gate status, changed build logs and malformed API success responses', async () => {
    const f = await fixture()
    const dryRun = {
      ...f.acceptance,
      gates: {
        ...f.acceptance.gates,
        independentReview: { ...f.acceptance.gates.independentReview, status: 'dry-run' },
      },
    }
    writeJson(f.acceptanceFile, dryRun)
    await expect(workflow.preflight(f)).rejects.toThrow()
    writeJson(f.acceptanceFile, f.acceptance)
    const malformedRun = async (command: string, args: string[]) =>
      args.some((arg) => arg.includes('releases?')) ? '{}' : f.run(command, args)
    await expect(workflow.preflight({ ...f, run: malformedRun })).rejects.toThrow('paginated')
    fs.appendFileSync(path.join(f.evidenceDirectory, 'test-all.log'), 'changed after acceptance')
    await expect(workflow.preflight(f)).rejects.toThrow('Build log changed')
  })

  it('uploads only to draft, verifies exact remote hashes and leaves source untouched', async () => {
    const f = await fixture()
    const before = sourceSnapshot(f)
    const verified = await workflow.draftRelease(f, `draft-${tag}@${master}`)
    expect(verified.status).toBe('verified-draft')
    expect(f.state.draft).toBe(true)
    expect(f.calls.find(({ args }) => args[1] === 'create')?.args).toContain('--draft')
    expect(
      f.calls.find(({ command, args }) => command === 'git' && args[0] === 'push')?.args,
    ).toEqual(['push', 'origin', `refs/tags/${tag}:refs/tags/${tag}`])
    expect(f.calls.some(({ args }) => args.includes('PATCH'))).toBe(false)
    expect(sourceSnapshot(f)).toEqual(before)
  })

  it.each(['corrupt-hash', 'missing-asset', 'wrong-tag', 'download-failure'])(
    'blocks public release after %s',
    async (kind) => {
      const f = await fixture()
      f.state.localTag = f.state.remoteTag = f.state.released = true
      if (kind === 'corrupt-hash') f.state.corruptDownload = true
      if (kind === 'missing-asset') f.state.missingRemoteAsset = true
      if (kind === 'wrong-tag') f.state.wrongTagObject = true
      if (kind === 'download-failure') f.state.fail = 'release download'
      await expect(workflow.publishRelease(f, `publish-${tag}@${master}`)).rejects.toThrow()
      expect(f.calls.some(({ args }) => args.includes('PATCH'))).toBe(false)
      expect(f.state.draft).toBe(true)
    },
  )

  it('requires separate public authorization and rechecks after publication', async () => {
    const f = await fixture()
    await workflow.draftRelease(f, `draft-${tag}@${master}`)
    await expect(workflow.publishRelease(f, `publish-${tag}@${source}`)).rejects.toThrow(
      'authorization',
    )
    const verified = await workflow.publishRelease(f, `publish-${tag}@${master}`)
    expect(verified.status).toBe('verified-public')
    expect(f.calls.filter(({ args }) => args.includes('PATCH'))).toHaveLength(1)
    expect(f.calls.at(-1)?.args[1]).toBe('download')
  })

  it.each(['git push', 'release create', 'release download'])(
    'preserves partial %s state and never retries/deletes tags',
    async (failure) => {
      const f = await fixture()
      const before = sourceSnapshot(f)
      f.state.fail = failure
      await expect(workflow.draftRelease(f, `draft-${tag}@${master}`)).rejects.toThrow(
        'external failure',
      )
      expect(f.state.localTag).toBe(true)
      expect(fs.existsSync(path.join(f.evidenceDirectory, 'draft-attempt.json'))).toBe(true)
      expect(f.calls.some(({ args }) => args.includes('--delete') || args[0] === 'reset')).toBe(
        false,
      )
      f.state.fail = ''
      await expect(workflow.draftRelease(f, `draft-${tag}@${master}`)).rejects.toThrow(
        'already exists',
      )
      expect(sourceSnapshot(f)).toEqual(before)
    },
  )
})
