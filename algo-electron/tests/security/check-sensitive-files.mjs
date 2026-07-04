import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const repoRoot = path.resolve(projectRoot, '..')

const forbiddenFilePatterns = [
  { regex: /(^|\/)\.env(?:\.|$)/i, reason: '.env files must not be committed' },
  { regex: /\.(?:sqlite|sqlite3|db)$/i, reason: 'local database files must not be committed' },
  { regex: /\.log$/i, reason: 'log files must not be committed' },
]

const highConfidenceSecretPatterns = [
  {
    regex: /\bCookie\s*:\s*[^`\r\n]{12,}/i,
    reason: 'raw Cookie header-like value',
  },
  {
    regex: /\bSet-Cookie\s*:\s*[^`\r\n]{12,}/i,
    reason: 'raw Set-Cookie header-like value',
  },
  {
    regex: /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
    reason: 'Authorization bearer token-like value',
  },
  {
    regex: /\b(?:LEETCODE_SESSION|JSESSIONID|sessionid|csrftoken|csrf_token|csrfToken)\s*=\s*[A-Za-z0-9._~+/=-]{12,}/,
    reason: 'session or csrf token-like assignment',
  },
]

const binaryExtensions = new Set([
  '.ico',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.pdf',
  '.zip',
  '.7z',
  '.gz',
  '.sqlite',
  '.sqlite3',
  '.db',
])

function listRepositoryFiles() {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    throw new Error(result.stderr || 'git ls-files failed')
  }

  return result.stdout
    .split('\0')
    .filter(Boolean)
    .map((file) => file.replace(/\\/g, '/'))
}

function isTextFile(filePath) {
  return !binaryExtensions.has(path.extname(filePath).toLowerCase())
}

function checkForbiddenFiles(files) {
  const failures = []

  for (const file of files) {
    for (const pattern of forbiddenFilePatterns) {
      if (pattern.regex.test(file)) {
        failures.push(`${file}: ${pattern.reason}`)
      }
    }
  }

  return failures
}

function checkSecretPatterns(files) {
  const failures = []

  for (const file of files) {
    const absolutePath = path.join(repoRoot, file)
    if (!fs.existsSync(absolutePath) || !isTextFile(file)) {
      continue
    }

    const text = fs.readFileSync(absolutePath, 'utf8')
    for (const pattern of highConfidenceSecretPatterns) {
      if (pattern.regex.test(text)) {
        failures.push(`${file}: possible ${pattern.reason}`)
      }
    }
  }

  return failures
}

const files = listRepositoryFiles()
const failures = [
  ...checkForbiddenFiles(files),
  ...checkSecretPatterns(files),
]

if (failures.length > 0) {
  console.error('Sensitive file checks failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Sensitive file checks passed')
