import { resolveCodeforcesNavigateUrl } from './sites/codeforcesUrls'

/** 浏览器导航前统一解析 URL（各平台特殊规则） */
export function resolveNavigateUrl(url: string): string {
  if (url.includes('codeforces.com')) {
    return resolveCodeforcesNavigateUrl(url)
  }
  return url
}
