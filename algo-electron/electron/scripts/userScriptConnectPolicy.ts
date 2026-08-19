export interface UserScriptRequestTarget {
  url: string
  origin: string
  hostname: string
  permissionHost: string
}

export function resolveUserScriptRequestTarget(
  rawUrl: unknown,
  allowInsecureLocalhost = false,
): UserScriptRequestTarget | null {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 8_192) return null
  try {
    const url = new URL(rawUrl)
    if (url.username || url.password) return null
    if (url.protocol !== 'https:' && !(allowInsecureLocalhost && url.protocol === 'http:' && isLoopback(url.hostname))) {
      return null
    }
    const hostname = normalizeHostname(url.hostname)
    if (!hostname) return null
    return {
      url: url.toString(),
      origin: url.origin,
      hostname,
      permissionHost: hostname,
    }
  }
  catch {
    return null
  }
}

export function isUserScriptConnectDeclared(
  declarations: readonly string[],
  frameUrl: string,
  target: UserScriptRequestTarget,
): boolean {
  const frameHostname = resolveFrameHostname(frameUrl)
  return declarations.some((declaration) => {
    const rule = normalizeConnectDeclaration(declaration)
    if (!rule) return false
    if (rule === '*') return true
    if (rule === 'self') return frameHostname !== null && target.hostname === frameHostname
    return target.hostname === rule || target.hostname.endsWith(`.${rule}`)
  })
}

function normalizeConnectDeclaration(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (trimmed === '*' || trimmed === 'self') return trimmed
  const withoutWildcard = trimmed.startsWith('*.') ? trimmed.slice(2) : trimmed
  if (
    withoutWildcard.length === 0
    || withoutWildcard.length > 253
    || /[\s/@?#]/.test(withoutWildcard)
    || withoutWildcard.includes(':')
  ) return null
  try {
    const parsed = new URL(`https://${withoutWildcard}`)
    if (parsed.hostname !== withoutWildcard || parsed.port || parsed.pathname !== '/') return null
    return normalizeHostname(parsed.hostname)
  }
  catch {
    return null
  }
}

function resolveFrameHostname(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return normalizeHostname(url.hostname)
  }
  catch {
    return null
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '')
}

function isLoopback(hostname: string): boolean {
  const normalized = normalizeHostname(hostname)
  return normalized === 'localhost'
    || normalized === '::1'
    || normalized === '[::1]'
    || /^127(?:\.\d{1,3}){3}$/.test(normalized)
}
