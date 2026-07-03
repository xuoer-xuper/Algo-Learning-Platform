export interface SiteConfigView {
  id: string
  name: string
  domains: string[]
  homeUrl?: string
  enabled: boolean
  problemUrlPatterns?: string[]
  submitUrlPatterns?: string[]
  cookiePolicy?: string
  adapter?: string
  isBuiltin?: boolean
}

export interface ImportPreviewSite {
  id: string
  name: string
  domains: string[]
  homeUrl: string
  enabled: boolean
  problemUrlPatterns?: string[]
  submitUrlPatterns?: string[]
  cookiePolicy?: string
  adapter?: string
  isBuiltin: boolean
}

export interface ImportConflict {
  id: string
  name: string
  existing: ImportPreviewSite
  incoming: ImportPreviewSite
}

export interface ImportPreview {
  newSites: ImportPreviewSite[]
  conflicts: ImportConflict[]
  builtinSkipped: ImportPreviewSite[]
}

export interface NewSiteDraft {
  id: string
  name: string
  domains: string
  homeUrl: string
  patterns: string
}
