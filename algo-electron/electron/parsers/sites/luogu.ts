import type { SiteAdapter } from '../types'
import type { ProblemIdentity } from '../../shared/types'

export const luoguParser: SiteAdapter = {
  id: 'luogu',

  match(url: string): boolean {
    try {
      const u = new URL(url)
      return u.hostname === 'luogu.com.cn' || u.hostname === 'www.luogu.com.cn'
    } catch {
      return false
    }
  },

  parse(url: string): ProblemIdentity | null {
    try {
      const u = new URL(url)
      const m = u.pathname.match(/^\/problem\/([A-Za-z0-9_]+)/)
      if (m) {
        const problemId = m[1]
        if (problemId.toLowerCase() === 'list') return null
        
        return {
          platform: 'luogu',
          platformProblemId: problemId,
          canonicalUrl: `https://www.luogu.com.cn/problem/${problemId}`,
          confidence: 'url',
        }
      }
    } catch {
      // invalid URL
    }
    return null
  },

  extractTitleScript(): string {
    return `(() => {
      let title = document.title;
      if (title.includes('洛谷')) {
        const parts = title.split('-');
        if (parts.length > 1) {
          title = parts.slice(0, -1).join('-').trim();
        }
      } else {
        title = title.trim();
      }
      
      // Remove leading problem ID (e.g., "P1055 ", "B2005 ", "CF1A ")
      title = title.replace(/^([A-Za-z0-9_]+)\\s*/, '');
      // Remove leading bracket tags (e.g., "[NOIP 2008 普及组] ", "[USACO19DEC] ")
      title = title.replace(/^(\\[.*?\\]\\s*)+/, '');
      
      return title.trim();
    })()`
  }
}
