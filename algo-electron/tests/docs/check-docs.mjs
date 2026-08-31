import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const projectRoot = path.resolve(process.cwd())
const repoRoot = path.resolve(projectRoot, '..')

const excludedPathParts = new Set([
  '.git',
  'node_modules',
  'tmp',
  'release',
  'dist',
  'dist-electron',
])

const readmeCoverageTargets = [
  path.join(projectRoot, 'src'),
  path.join(projectRoot, 'electron'),
  path.join(projectRoot, 'tests'),
  path.join(repoRoot, '.github'),
  path.join(repoRoot, '.github', 'ISSUE_TEMPLATE'),
  path.join(repoRoot, '.github', 'workflows'),
  path.join(projectRoot, 'build'),
  path.join(projectRoot, 'public'),
  path.join(repoRoot, 'docs', 'ADR'),
]

const readmeContentRules = [
  {
    label: '职责',
    patterns: [/职责/],
  },
  {
    label: '当前实现或覆盖范围',
    patterns: [/当前实现/, /当前覆盖/, /当前内容/, /目录覆盖/, /实现程度/, /当前功能域/, /当前状态/, /模板/],
  },
  {
    label: '封装入口或关键文件',
    patterns: [/关键函数/, /封装/, /\bAPI\b/, /入口/, /核心类型/, /当前内容/, /目录覆盖/, /运行方式/, /关键文件/, /脚本/, /文件/, /模板/],
  },
  {
    label: '边界或维护规则',
    patterns: [/边界/, /规则/, /不得/, /不允许/, /不能/, /不要/, /只用于/, /敏感/, /维护要求/],
  },
  {
    label: '验证入口',
    patterns: [/验证/, /测试/, /运行方式/, /命令/, /npm run/, /test:/],
  },
]

const docsIndexPath = path.join(repoRoot, 'docs', 'README.md')
const docsRootPath = path.join(repoRoot, 'docs')
const packageJsonPath = path.join(projectRoot, 'package.json')

function hasExcludedPart(filePath) {
  return filePath
    .split(path.sep)
    .some((part) => excludedPathParts.has(part))
}

function walkFiles(rootDir, predicate, files = []) {
  if (!fs.existsSync(rootDir)) {
    return files
  }

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name)

    if (hasExcludedPart(entryPath)) {
      continue
    }

    if (entry.isDirectory()) {
      walkFiles(entryPath, predicate, files)
    } else if (predicate(entryPath)) {
      files.push(entryPath)
    }
  }

  return files
}

function normalizeMarkdownTarget(target) {
  const trimmed = target.trim()

  if (!trimmed || /^(https?:|mailto:|#)/i.test(trimmed)) {
    return null
  }

  const withoutTitle = trimmed.startsWith('<') && trimmed.endsWith('>')
    ? trimmed.slice(1, -1)
    : trimmed.split(/\s+/)[0]

  const withoutAnchor = withoutTitle.split('#')[0]

  if (!withoutAnchor) {
    return null
  }

  return decodeURIComponent(withoutAnchor)
}

function checkMarkdownLinks() {
  const markdownFiles = walkFiles(
    repoRoot,
    (filePath) => filePath.toLowerCase().endsWith('.md'),
  )

  const errors = []
  const linkPattern = /!?\[[^\]]*]\(([^)]+)\)/g

  for (const markdownFile of markdownFiles) {
    const text = fs.readFileSync(markdownFile, 'utf8')
    let match

    while ((match = linkPattern.exec(text)) !== null) {
      const target = normalizeMarkdownTarget(match[1])
      if (!target) {
        continue
      }

      const resolvedTarget = path.resolve(path.dirname(markdownFile), target)
      if (!fs.existsSync(resolvedTarget)) {
        errors.push(`${path.relative(repoRoot, markdownFile)}: missing ${target}`)
      }
    }
  }

  return errors
}

function getMarkdownLinkTargets(markdownFile) {
  const text = fs.readFileSync(markdownFile, 'utf8')
  const targets = new Set()
  const linkPattern = /!?\[[^\]]*]\(([^)]+)\)/g
  let match

  while ((match = linkPattern.exec(text)) !== null) {
    const target = normalizeMarkdownTarget(match[1])
    if (!target) {
      continue
    }

    targets.add(path.resolve(path.dirname(markdownFile), target))
  }

  return targets
}

function checkDocsIndexCoverage() {
  const errors = []

  if (!fs.existsSync(docsIndexPath)) {
    return [`Missing docs index: ${path.relative(repoRoot, docsIndexPath)}`]
  }

  const linkedTargets = getMarkdownLinkTargets(docsIndexPath)
  const requiredTargets = getDocsIndexRequiredTargets()

  for (const target of requiredTargets) {
    if (!linkedTargets.has(target)) {
      errors.push(`docs/README.md does not index ${path.relative(repoRoot, target)}`)
    }
  }

  return errors
}

function checkDocsNaming() {
  const invalidDirectories = new Set()
  const invalidFiles = new Set()

  if (!fs.existsSync(docsRootPath)) {
    return [`Missing docs directory: ${path.relative(repoRoot, docsRootPath)}`]
  }

  try {
    const trackedDocs = execFileSync('git', ['ls-files', '--', 'docs'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .split(/\r?\n/)
      .filter(Boolean)

    for (const trackedPath of trackedDocs) {
      const parts = trackedPath.split('/')
      const fileName = parts.at(-1)

      for (let index = 1; index < parts.length - 1; index += 1) {
        if (!/^[A-Z0-9_]+$/.test(parts[index])) {
          invalidDirectories.add(parts.slice(0, index + 1).join('/'))
        }
      }

      if (fileName !== 'README.md' && fileName?.toLowerCase().endsWith('.md') && !/^[A-Z0-9_]+\.md$/.test(fileName)) {
        invalidFiles.add(trackedPath)
      }
    }
  } catch {
    // Filesystem checks below still cover source archives without Git metadata.
  }

  for (const dir of walkDirectories(docsRootPath)) {
    const relative = path.relative(docsRootPath, dir)
    const parts = relative.split(path.sep)
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      if (part && !/^[A-Z0-9_]+$/.test(part)) {
        invalidDirectories.add(['docs', ...parts.slice(0, index + 1)].join('/'))
      }
    }
  }

  for (const file of walkFiles(
    docsRootPath,
    (filePath) => filePath.toLowerCase().endsWith('.md'),
  )) {
    const name = path.basename(file)
    if (name === 'README.md') {
      continue
    }

    if (!/^[A-Z0-9_]+\.md$/.test(name)) {
      invalidFiles.add(path.relative(repoRoot, file).split(path.sep).join('/'))
    }
  }

  return [
    ...Array.from(invalidDirectories).sort().map(
      (dir) => `${dir}: docs directory names must use UPPER_SNAKE_CASE`,
    ),
    ...Array.from(invalidFiles).sort().map(
      (file) => `${file}: docs markdown names must use UPPER_SNAKE_CASE.md`,
    ),
  ]
}

function checkNpmScriptReferences() {
  const errors = []

  if (!fs.existsSync(packageJsonPath)) {
    return [`Missing package.json: ${path.relative(repoRoot, packageJsonPath)}`]
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const scripts = new Set(Object.keys(packageJson.scripts ?? {}))
  const markdownFiles = walkFiles(
    repoRoot,
    (filePath) => filePath.toLowerCase().endsWith('.md'),
  )
  const scriptPattern = /npm\s+run\s+([A-Za-z0-9:_*-]+)/g

  for (const markdownFile of markdownFiles) {
    const text = fs.readFileSync(markdownFile, 'utf8')
    let match

    while ((match = scriptPattern.exec(text)) !== null) {
      const scriptName = match[1]
      if (scriptName.includes('*')) {
        continue
      }

      if (!scripts.has(scriptName)) {
        errors.push(`${path.relative(repoRoot, markdownFile)}: npm script ${scriptName} is not defined`)
      }
    }
  }

  return errors
}

/**
 * README 里写的 `npx vitest run <路径>` 必须真的指向存在的测试路径。
 *
 * 与 checkNpmScriptReferences 同理：入口写错时读者会以为自己跑过了，而 vitest 对不存在
 * 的路径只报 "No test files found" 并以 0 退出——不会有任何人发现。测试文件改名或移动
 * 之后 README 静默失效，这条负责把它报出来。
 *
 * 同时统一写法：`npm exec vitest` 两种变体不再允许，三种写法混用没有任何收益。
 */
/**
 * 取出 Markdown 里所有围栏代码块的内容。
 *
 * 命令类检查只看围栏内：行文里提到某个写法（"不要用 npm exec vitest"、
 * `npx vitest run <路径>` 这样的占位说明）不是命令，否则这条检查会先把解释它自己的
 * 那份文档判成违规。
 */
function extractFencedBlocks(text) {
  return [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(match => match[1])
}

function checkVitestPathReferences() {
  const errors = []
  const markdownFiles = walkFiles(repoRoot, (filePath) => filePath.toLowerCase().endsWith('.md'))
  const commandPattern = /npx\s+vitest\s+run\s+([^\n]+)/g
  const legacyPattern = /npm\s+exec\s+vitest\b/

  for (const markdownFile of markdownFiles) {
    const relativeFile = path.relative(repoRoot, markdownFile)
    const text = extractFencedBlocks(fs.readFileSync(markdownFile, 'utf8')).join('\n')

    if (legacyPattern.test(text)) {
      errors.push(`${relativeFile}: 用 npx vitest run，不要用 npm exec vitest`)
    }

    let match
    while ((match = commandPattern.exec(text)) !== null) {
      for (const target of match[1].trim().split(/\s+/)) {
        if (target.startsWith('-')) continue
        if (target.includes('\\')) {
          errors.push(`${relativeFile}: 测试路径用正斜杠，不要用反斜杠：${target}`)
          continue
        }
        if (!fs.existsSync(path.join(projectRoot, target))) {
          errors.push(`${relativeFile}: 引用的测试路径不存在：${target}`)
        }
      }
    }
  }

  return errors
}

function getDocsIndexRequiredTargets() {
  const targets = new Set()

  for (const readme of getReadmeCoverageFiles()) {
    targets.add(readme)
  }

  for (const file of fs.readdirSync(repoRoot)) {
    if (file.toLowerCase().endsWith('.md')) {
      targets.add(path.join(repoRoot, file))
    }
  }

  for (const file of walkFiles(
    docsRootPath,
    (filePath) => filePath.toLowerCase().endsWith('.md'),
  )) {
    if (path.resolve(file) !== path.resolve(docsIndexPath)) {
      targets.add(file)
    }
  }

  targets.delete(docsIndexPath)
  return Array.from(targets).map((target) => path.resolve(target)).sort()
}

function checkReadmeCoverage() {
  const errors = []

  for (const target of readmeCoverageTargets) {
    if (!fs.existsSync(target)) {
      errors.push(`Missing coverage target: ${path.relative(repoRoot, target)}`)
      continue
    }

    if (!fs.existsSync(path.join(target, 'README.md'))) {
      errors.push(`Missing README.md: ${path.relative(repoRoot, target)}`)
    }

    if (target.endsWith(`${path.sep}src`) || target.endsWith(`${path.sep}electron`) || target.endsWith(`${path.sep}tests`)) {
      for (const dir of walkDirectories(target)) {
        if (!fs.existsSync(path.join(dir, 'README.md'))) {
          errors.push(`Missing README.md: ${path.relative(repoRoot, dir)}`)
        }
      }
    }
  }

  return errors
}

function checkReadmeContentQuality() {
  const errors = []

  for (const readmeFile of getReadmeCoverageFiles()) {
    const text = fs.readFileSync(readmeFile, 'utf8')

    for (const rule of readmeContentRules) {
      if (!rule.patterns.some((pattern) => pattern.test(text))) {
        errors.push(`${path.relative(repoRoot, readmeFile)}: README should mention ${rule.label}`)
      }
    }
  }

  return errors
}

function getReadmeCoverageFiles() {
  const files = new Set()

  for (const target of readmeCoverageTargets) {
    if (!fs.existsSync(target)) {
      continue
    }

    const targetReadme = path.join(target, 'README.md')
    if (fs.existsSync(targetReadme)) {
      files.add(targetReadme)
    }

    if (target.endsWith(`${path.sep}src`) || target.endsWith(`${path.sep}electron`) || target.endsWith(`${path.sep}tests`)) {
      for (const dir of walkDirectories(target)) {
        const readme = path.join(dir, 'README.md')
        if (fs.existsSync(readme)) {
          files.add(readme)
        }
      }
    }
  }

  return Array.from(files).sort()
}

function walkDirectories(rootDir, dirs = []) {
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name)

    if (hasExcludedPart(entryPath) || !entry.isDirectory()) {
      continue
    }

    dirs.push(entryPath)
    walkDirectories(entryPath, dirs)
  }

  return dirs
}

const errors = [
  ...checkMarkdownLinks(),
  ...checkDocsNaming(),
  ...checkReadmeCoverage(),
  ...checkReadmeContentQuality(),
  ...checkDocsIndexCoverage(),
  ...checkNpmScriptReferences(),
  ...checkVitestPathReferences(),
]

if (errors.length > 0) {
  console.error('Documentation checks failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('Documentation checks passed')
