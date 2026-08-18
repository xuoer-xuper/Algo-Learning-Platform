import type { InternalPage } from './tabManagerTypes'

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
