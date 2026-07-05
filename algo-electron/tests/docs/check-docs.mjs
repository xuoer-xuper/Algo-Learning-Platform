import fs from 'node:fs'
import path from 'node:path'

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
  const errors = []

  if (!fs.existsSync(docsRootPath)) {
    return [`Missing docs directory: ${path.relative(repoRoot, docsRootPath)}`]
  }

  for (const dir of walkDirectories(docsRootPath)) {
    const relative = path.relative(docsRootPath, dir)
    for (const part of relative.split(path.sep)) {
      if (part && !/^[A-Z0-9_]+$/.test(part)) {
        errors.push(`${path.relative(repoRoot, dir)}: docs directory names must use UPPER_SNAKE_CASE`)
        break
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
      errors.push(`${path.relative(repoRoot, file)}: docs markdown names must use UPPER_SNAKE_CASE.md`)
    }
  }

  return errors
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
]

if (errors.length > 0) {
  console.error('Documentation checks failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('Documentation checks passed')
