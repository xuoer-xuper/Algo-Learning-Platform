import { isInternalPage, type InternalPage } from './tabManagerTypes'

const INTERNAL_PAGE_TITLES: Record<InternalPage['type'], string> = {
  home: '首页',
  settings: '设置',
  dashboard: '学习统计',
  scripts: '脚本管理',
  'coach-metrics': 'Coach 指标',
  'problem-detail': '题目详情',
  notes: '本地笔记',
  credentials: '账户',
  'script-install': '安装脚本',
}

export function getInternalPageTitle(page: InternalPage): string {
  return INTERNAL_PAGE_TITLES[page.type]
}

export function getInternalPageUrl(page: InternalPage): string {
  switch (page.type) {
    case 'problem-detail':
      return `algo://problem-detail?problemId=${encodeURIComponent(page.problemId)}`
    case 'notes':
      return `algo://problem-notes?problemId=${encodeURIComponent(page.problemId)}`
    case 'script-install':
      return `algo://script-install?installId=${encodeURIComponent(page.installId)}`
    default:
      return `algo://${page.type}`
  }
}

export function parseInternalPageUrl(value: string): InternalPage | null {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (
    parsed.protocol !== 'algo:'
    || parsed.username
    || parsed.password
    || parsed.port
    || parsed.pathname
    || parsed.hash
  ) {
    return null
  }

  let page: InternalPage | null = null
  if (!parsed.search) {
    switch (parsed.hostname) {
      case 'home': page = { type: 'home' }; break
      case 'settings': page = { type: 'settings' }; break
      case 'dashboard': page = { type: 'dashboard' }; break
      case 'scripts': page = { type: 'scripts' }; break
      case 'coach-metrics': page = { type: 'coach-metrics' }; break
      case 'credentials': page = { type: 'credentials' }; break
    }
  } else if (parsed.searchParams.size === 1) {
    if (parsed.hostname === 'problem-detail' && parsed.searchParams.has('problemId')) {
      page = { type: 'problem-detail', problemId: parsed.searchParams.get('problemId') ?? '' }
    } else if (parsed.hostname === 'problem-notes' && parsed.searchParams.has('problemId')) {
      page = { type: 'notes', problemId: parsed.searchParams.get('problemId') ?? '' }
    } else if (parsed.hostname === 'script-install' && parsed.searchParams.has('installId')) {
      page = { type: 'script-install', installId: parsed.searchParams.get('installId') ?? '' }
    }
  }

  return page && isInternalPage(page) && getInternalPageUrl(page) === value ? page : null
}

export function sameInternalPage(left: InternalPage, right: InternalPage): boolean {
  if (left.type !== right.type) return false
  if (left.type === 'problem-detail' && right.type === 'problem-detail') {
    return left.problemId === right.problemId
  }
  if (left.type === 'notes' && right.type === 'notes') {
    return left.problemId === right.problemId
  }
  if (left.type === 'script-install' && right.type === 'script-install') {
    return left.installId === right.installId
  }
  return true
}
