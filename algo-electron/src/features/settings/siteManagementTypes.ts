export interface SiteConfigView {
  id: string
  name: string
  domains: string[]
  enabled: boolean
  isBuiltin?: boolean
}

export interface ImportPreviewSite {
  id: string
  name: string
  domains: string[]
}

export interface ImportConflict {
  id: string
  name: string
  incoming: ImportPreviewSite
  domains: string[]
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
