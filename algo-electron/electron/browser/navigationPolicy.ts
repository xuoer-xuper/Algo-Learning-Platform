export type NavigationBlockReason = 'invalid-url' | 'insecure-http' | 'unsupported-protocol'

export interface NavigationDecision {
  allowed: boolean
  reason?: NavigationBlockReason
}

export interface NavigationPolicyOptions {
  allowInsecureLocalhost?: boolean
  allowAboutBlank?: boolean
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '[::1]'
    || normalized === '::1'
}

export function evaluateBrowserNavigation(
  value: string,
  options: NavigationPolicyOptions = {},
): NavigationDecision {
  if (options.allowAboutBlank && value === 'about:blank') return { allowed: true }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { allowed: false, reason: 'invalid-url' }
  }

  if (parsed.protocol === 'https:') return { allowed: true }
  if (parsed.protocol === 'http:') {
    return options.allowInsecureLocalhost && isLoopbackHost(parsed.hostname)
      ? { allowed: true }
      : { allowed: false, reason: 'insecure-http' }
  }

  return { allowed: false, reason: 'unsupported-protocol' }
}
