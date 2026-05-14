export interface SiteConfig {
  id: string
  name: string
  domains: string[]
  homeUrl: string
  enabled: boolean
  problemUrlPatterns: string[]
  submitUrlPatterns?: string[]
  cookiePolicy?: 'session-only' | 'vault-readable'
  adapter?: string
}
