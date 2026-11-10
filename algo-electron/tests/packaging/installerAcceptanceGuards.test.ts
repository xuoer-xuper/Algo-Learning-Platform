import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error Standalone installer preparation is runtime JavaScript.
import { assertHostedRunner } from './prepare-installer-acceptance.mjs'

const testRoot = path.resolve('tmp', 'installer-acceptance-guard-tests')
const directories: string[] = []

function fixture() {
  fs.mkdirSync(testRoot, { recursive: true })
  const directory = fs.mkdtempSync(path.join(testRoot, 'case-'))
  directories.push(directory)
  const homedir = path.join(directory, 'synthetic-user')
  const runnerTemp = path.join(directory, 'runner-temp')
  fs.mkdirSync(homedir)
  fs.mkdirSync(runnerTemp)
  return {
    directory,
    user: { username: 'synthetic-runner', homedir },
    env: {
      GITHUB_ACTIONS: 'true',
      RUNNER_ENVIRONMENT: 'github-hosted',
      RUNNER_OS: 'Windows',
      GITHUB_REPOSITORY: 'xuoer-xuper/Algo-Learning-Platform',
      GITHUB_RUN_ID: '123',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_SHA: 'a'.repeat(40),
      RUNNER_TEMP: runnerTemp,
      USERPROFILE: homedir,
      APPDATA: path.join(homedir, 'AppData', 'Roaming'),
      LOCALAPPDATA: path.join(homedir, 'AppData', 'Local'),
    },
  }
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    expect(path.dirname(fs.realpathSync(directory))).toBe(fs.realpathSync(testRoot))
    fs.rmSync(directory, { recursive: true })
  }
})

describe('installer acceptance environment guards', () => {
  it('validates an isolated environment without creating application data', () => {
    const { directory, env, user } = fixture()
    expect(() => assertHostedRunner(env, 'win32', user)).not.toThrow()
    expect(fs.readdirSync(user.homedir)).toEqual([])
    expect(fs.readdirSync(directory).sort()).toEqual(['runner-temp', 'synthetic-user'])
  })

  it.each([
    ['GITHUB_ACTIONS', 'false', /requires GitHub Actions/],
    ['RUNNER_ENVIRONMENT', 'self-hosted', /Self-hosted runners are refused/],
    ['RUNNER_OS', 'Linux', /Windows runner required/],
    ['GITHUB_REPOSITORY', 'someone/else', /Unexpected repository/],
    ['GITHUB_SHA', 'unknown', /match/],
    ['GITHUB_RUN_ID', '', /match/],
    ['GITHUB_RUN_ATTEMPT', '0', /match/],
    ['RUNNER_TEMP', '../relative', /Absolute RUNNER_TEMP/],
  ])('refuses invalid %s before creating inputs', (key, value, message) => {
    const { env, user } = fixture()
    expect(() => assertHostedRunner({ ...env, [key]: value }, 'win32', user)).toThrow(message)
    expect(fs.readdirSync(env.RUNNER_TEMP)).toEqual([])
  })

  it('rejects redirected profile folders and smoke flags', () => {
    const { directory, env, user } = fixture()
    for (const key of ['USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
      expect(() => assertHostedRunner({ ...env, [key]: directory }, 'win32', user)).toThrow(
        /Unexpected/,
      )
    }
    expect(() =>
      assertHostedRunner({ ...env, ALGO_ELECTRON_SMOKE_USER_DATA: directory }, 'win32', user),
    ).toThrow(/No smoke-mode redirection/)
    for (const key of ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'VITE_DEV_SERVER_URL']) {
      expect(() => assertHostedRunner({ ...env, [key]: 'test' }, 'win32', user)).toThrow(
        /Runtime override environment is forbidden/,
      )
    }
  })

  it('rejects a linked runner directory', () => {
    const { directory, env, user } = fixture()
    const link = path.join(directory, 'linked-temp')
    fs.symlinkSync(env.RUNNER_TEMP, link, 'junction')
    expect(() => assertHostedRunner({ ...env, RUNNER_TEMP: link }, 'win32', user)).toThrow(
      /must not contain links/,
    )
    fs.unlinkSync(link)
  })

  it.skipIf(process.platform !== 'win32')(
    'removes authentication tokens only from launched children',
    () => {
      const { directory } = fixture()
      const tokenNames = [
        'GH_TOKEN',
        'GITHUB_TOKEN',
        'GH_ENTERPRISE_TOKEN',
        'GITHUB_ENTERPRISE_TOKEN',
        'ACTIONS_RUNTIME_TOKEN',
        'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
      ]
      const preservedNames = ['USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'GITHUB_ACTIONS']
      const childProbe = path.join(directory, 'environment-probe.mjs')
      const powershellProbe = path.join(directory, 'process-probe.ps1')
      const env = { ...process.env, GITHUB_ACTIONS: 'synthetic-identity' }
      fs.writeFileSync(
        childProbe,
        `const tokens = ${JSON.stringify(tokenNames)};
const expected = ${JSON.stringify(Object.fromEntries(preservedNames.map((name) => [name, env[name as keyof typeof env]])))};
process.stdout.write(JSON.stringify({
  tokenPresence: Object.fromEntries(tokens.map(name => [name, Object.hasOwn(process.env, name)])),
  identityPreserved: Object.entries(expected).every(([name, value]) => process.env[name] === value),
}));
`,
      )
      fs.writeFileSync(
        powershellProbe,
        `param([string]$Harness, [string]$NodeExecutable, [string]$Probe)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($Harness, [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) { throw 'Harness syntax is invalid' }
foreach ($name in @('Assert-True', 'Start-GuestProcess', 'Get-VerifiedExitCode')) {
    $definitions = @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true))
    if ($definitions.Count -ne 1) { throw 'Expected a unique process function' }
    . ([scriptblock]::Create($definitions[0].Extent.Text))
}
$child = Start-GuestProcess $NodeExecutable @($Probe) ([IO.Path]::GetDirectoryName($Probe)) $true
$stdout = $child.StandardOutput.ReadToEndAsync()
$stderr = $child.StandardError.ReadToEndAsync()
if (-not $child.WaitForExit(10000)) { $child.Kill(); throw 'Environment probe timed out' }
$child.WaitForExit()
if ((Get-VerifiedExitCode $child) -ne 0) { throw 'Environment probe failed' }
if (-not $stdout.Wait(10000) -or -not $stderr.Wait(10000)) { throw 'Probe output incomplete' }
$result = $stdout.GetAwaiter().GetResult() | ConvertFrom-Json
$parentUnchanged = $true
foreach ($name in @(${tokenNames.map((name) => `'${name}'`).join(', ')})) {
    if ([Environment]::GetEnvironmentVariable($name) -cne 'synthetic-auth-value') { $parentUnchanged = $false }
}
[ordered]@{ child = $result; parentTokensUnchanged = $parentUnchanged } | ConvertTo-Json -Depth 5 -Compress
`,
      )
      const result = spawnSync(
        'powershell.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          powershellProbe,
          '-Harness',
          path.resolve('tests/packaging/sandbox-upgrade-guest.ps1'),
          '-NodeExecutable',
          process.execPath,
          '-Probe',
          childProbe,
        ],
        {
          cwd: directory,
          env: {
            ...env,
            ...Object.fromEntries(tokenNames.map((name) => [name, 'synthetic-auth-value'])),
          },
          encoding: 'utf8',
          windowsHide: true,
          timeout: 20000,
        },
      )
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
      expect(JSON.parse(result.stdout)).toEqual({
        child: {
          tokenPresence: Object.fromEntries(tokenNames.map((name) => [name, false])),
          identityPreserved: true,
        },
        parentTokensUnchanged: true,
      })
    },
  )

  it('refuses local CLI invocation before downloading or writing installer inputs', () => {
    const { directory } = fixture()
    const result = spawnSync(
      process.execPath,
      [path.resolve('tests/packaging/prepare-installer-acceptance.mjs')],
      {
        cwd: directory,
        env: { ...process.env, GITHUB_ACTIONS: 'false' },
        encoding: 'utf8',
        windowsHide: true,
      },
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/requires (?:Windows|GitHub Actions)/)
    expect(fs.readdirSync(directory).sort()).toEqual(['runner-temp', 'synthetic-user'])
  })

  it('rejects fixture path override and local GitHub mode before owner or profile access', () => {
    const { directory } = fixture()
    for (const args of [
      ['bootstrap', '--profile=unexpected'],
      ['bootstrap', '--environment=GitHubActions'],
    ]) {
      const result = spawnSync(
        process.execPath,
        [path.resolve('tests/packaging/sandbox-upgrade-data.mjs'), ...args],
        {
          cwd: directory,
          env: { ...process.env, GITHUB_ACTIONS: 'false' },
          encoding: 'utf8',
          windowsHide: true,
        },
      )
      expect(result.status).toBe(1)
      expect(result.stderr).toMatch(
        /Profile\/path overrides are forbidden|GitHub Actions is required|Windows guest required/,
      )
      expect(fs.readdirSync(directory).sort()).toEqual(['runner-temp', 'synthetic-user'])
    }
  })
})
