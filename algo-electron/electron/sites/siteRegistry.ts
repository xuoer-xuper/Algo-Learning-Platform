import type { SiteConfig } from './types'
import { codeforces } from './builtins/codeforces'
import { acwing } from './builtins/acwing'
import { nowcoder } from './builtins/nowcoder'
import { vjudge } from './builtins/vjudge'
import { pta } from './builtins/pta'

const builtins: SiteConfig[] = [codeforces, acwing, nowcoder, vjudge, pta]

export class SiteRegistry {
  private sites: Map<string, SiteConfig>

  constructor() {
    this.sites = new Map()
    for (const site of builtins) {
      this.sites.set(site.id, site)
    }
  }

  getById(id: string): SiteConfig | undefined {
    return this.sites.get(id)
  }

  getByDomain(domain: string): SiteConfig | undefined {
    for (const site of this.sites.values()) {
      if (site.enabled && site.domains.includes(domain)) {
        return site
      }
    }
    return undefined
  }

  getAll(): SiteConfig[] {
    return Array.from(this.sites.values())
  }

  getEnabled(): SiteConfig[] {
    return this.getAll().filter((s) => s.enabled)
  }
}
