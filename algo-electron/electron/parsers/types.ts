import type { ProblemIdentity } from '../shared/types'

export interface SiteParser {
  siteId: string
  match(url: string): boolean
  parse(url: string): ProblemIdentity | null
}

export interface SiteAdapter {
  id: string
  match?(url: string): boolean
  parse?(url: string): ProblemIdentity | null
  extractTitleScript?(): string
}
